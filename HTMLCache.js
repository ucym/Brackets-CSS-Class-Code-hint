/*
Copyright (c) 2013 growlScript

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

/*jslint vars: true, plusplus: true, eqeq: true, devel: true, nomen: true,  regexp: true, indent: 4, maxerr: 50 */
/*global define, brackets, $, document */
define(function (require, exports, module) {
    "use strict";
    
    var DocumentManager = brackets.getModule("document/DocumentManager"),
        ElementLoader   = require("ElementLoader"),
        ProjectManager  = brackets.getModule("project/ProjectManager"),
        StyleRuleCache  = require("StyleRuleCache");

    /**
     * @private
     * @type {Object.<string, HTMLCache>}
     */
    var _instances      = {};

    /**
     * @private
     *
     * Resolve relative path.
     * @param {string} filePath
     */
    function _resolvePath(filePath) {
        var stack = [];
        
        $.each(filePath.split("/"), function () {
            if (this === "..") {
                stack.pop();
            } else if (this !== ".") {
                stack.push(this);
            }
        });
        
        return stack.join("/");
    }
    
    /**
     * @private
     *
     * Watching file updates.
     * @param {Document} doc
     */
    function _documentUpdateHandler(doc) {
        var htmlCache = _instances[doc.file.fullPath];
        
        if (!!htmlCache && htmlCache.isDisposed === false) {
            htmlCache.fetch();
        }
    }

    /**
     * @constructor
     *
     * HTML cache for inner Style elements and dependencies.
     * Events
     *      fetch - Fire on document fetched.
     *
     * @param {Document} document
     */
    function HTMLCache(document) {
        if (!!_instances[document.file.fullPath]) {
            var htmlCache = _instances[document.file.fullPath];
            htmlCache.fetch();
            return htmlCache;
        }
        
        StyleRuleCache.call(this);
        
        this._document = document;
        this._deps = [];
        
        this.fetch();
        
        _instances[this.fullPath] = this;
    }
    
    HTMLCache.prototype = Object.create(StyleRuleCache.prototype);
    HTMLCache.prototype.constructor = HTMLCache;
    HTMLCache.prototype.parentClass = StyleRuleCache.prototype;
    
    Object.defineProperties(HTMLCache.prototype, {
        "fullPath": {
            get: function () { return this._document.file.fullPath; },
            set: function () {}
        },
        "timestamp": {
            get: function () { return this._document.diskTimestamp; },
            set: function () {}
        },
        "depends": {
            get: function () { return this._deps; },
            set: function () {}
        }
    });
    
    /**
     * Assigned document.
     * @type {Document}
     */
    HTMLCache.prototype._document   = null;
    
    /**
     * Dependence file paths (fullPath)
     * @type {Array.<string>}
     */
    HTMLCache.prototype._deps       = null;
    
    /**
     * @private
     *
     * Survey dependent CSS files.
     */
    HTMLCache.prototype._surveyDependent = function () {
        var projectRoot = ProjectManager.getProjectRoot().fullPath,
            docRoot     = this.fullPath.substr(0, this.fullPath.lastIndexOf("/") + 1),
            depends     = [],
            links       = this._getText().match(/<link .*[ ]?href=["|'](.+)["|'].*>/g) || [];
        
        $.each(links, function () {
            var link = $.parseHTML(this)[0],
                path;

            if (link.href.slice(-3).toLowerCase() === "css") {
                path = link.getAttribute("href");

                // when reference root, rewrite to ProjectRoot path
                path = path[0] === "/" ? projectRoot + path : docRoot + path;
                path = _resolvePath(path);
                depends.push(path);
            }
        });

        this._deps = depends;
    };
    
    /**
     * @private
     *
     * Construct cache.
     */
    HTMLCache.prototype._fetchRules = function () {
        var self        = this,
            document    = this._getText(),
            styles      = document.match(/<style ?.*>[\s\S]*?<\/style>/gi) || [];
        
        if (!styles.length) { return; }
        
        styles = $.parseHTML(styles.join(""));
        $.each(styles, function (index, style) {
            var deferred = $.Deferred();
            
            // load style
            ElementLoader.load(style, function () { deferred.resolve(this); });
            
            deferred.done(function (element) {
                self.parseStyleRule(style.sheet.rules, style);
                element.remove();
                
                $(self).triggerHandler("ruleFetched");
            });
        });
    };
    
    /**
     * @private
     *
     * Get HTML contents as text.
     * @return {string}
     */
    HTMLCache.prototype._getText = function () {
        return this._document.getText();
    };
    
    /**
     * Fetch and parse HTML Content
     */
    HTMLCache.prototype.fetch = function () {
        var self = this;
        
        $(this).one("ruleFetched", function () { $(self).triggerHandler("fetch"); });
        
        this.clearCache();
        
        this._surveyDependent();
        this._fetchRules();
    };
    
    /**
     * Clear cache
     */
    HTMLCache.prototype.clearCache = function () {
        this.parentClass.clearCache.call(this);
        this._deps = [];
    };
    
    /**
     * Dispose object
     */
    HTMLCache.prototype.dispose = function () {
        delete _instances[this.fullPath];
        
        this._deps      = null;
        this._document  = null;
        
        this.parentClass.dispose.call(this);
    };
    
    // Listen document update events.
    $(DocumentManager).on("documentSaved documentRefreshed", function (e, doc) { _documentUpdateHandler(doc); });
    
    return HTMLCache;
});