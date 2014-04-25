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
/*global define, brackets, $ */
define(function (require, exports, module) {
    "use strict";
    
    var ElementLoader   = require("ElementLoader"),
        FileUtils       = brackets.getModule("file/FileUtils"),
        ProjectManager  = brackets.getModule("project/ProjectManager"),
        StyleRuleCache  = require("StyleRuleCache");

    var EXTERNAL_LINK = /^(?:http:|https:)\/\//i;

    /**
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
     * @constructor
     * Roles
     *  1. Parse and holding inner style rules.
     *  2. Analysis of dependent CSS file.
     *  3. Document update watching.
     *      - Save to auto update properties.
     *
     * Events
     *      disposed - Fire on instance disposed.
     *      fetchEnd - Fire on document fetched.
     *
     * @param {File} file File object
     */
    function HTMLCache(file) {
        StyleRuleCache.call(this);
        
        this._file = file;
        this._deps = [];
        
        this.fetch();
    }
    
    HTMLCache.prototype = Object.create(StyleRuleCache.prototype);
    HTMLCache.prototype.constructor = HTMLCache;
    HTMLCache.prototype.parentClass = StyleRuleCache.prototype;
    
    Object.defineProperties(HTMLCache.prototype, {
        fullPath: {
            get: function () { return this._file.fullPath; },
            set: function () {}
        },
        timestamp: {
            get: function () { return this._file._stat.mtime; },
            set: function () {}
        },
        deps: {
            get: function () { return this._deps; },
            set: function () {}
        }
    });
    
    /**
     * Assigned file.
     * @type {File}
     */
    HTMLCache.prototype._file   = null;
    
    /**
     * Dependence CSS files
     * @type {Array.<string>}
     */
    HTMLCache.prototype._deps   = null;
    
    /**
     * @type {Date}
     */
    HTMLCache.prototype._lastUpdateCheck = null;
    
    /**
     * Survey dependent CSS files.
     * @private
     * @param {string} content
     */
    HTMLCache.prototype._surveyDependent = function (content) {
        var self = this;
        
        return $.Deferred(function () {
            var projectRoot = ProjectManager.getProjectRoot().fullPath,
                docRoot     = self.fullPath.substr(0, self.fullPath.lastIndexOf("/") + 1),
                deps        = [],
                links;
                
            // Find style elements
            links = content.match(/<link .*[ ]?href=["|'](.+)["|'].*>/g) || [];
                
            $.each(links, function () {
                var link = $.parseHTML(this)[0],
                    path;
    
                if (link.href.slice(-3).toLowerCase() === "css") {
                    path = link.getAttribute("href");
                    
                    if (EXTERNAL_LINK.test(path) === false) {
                        // when reference root, rewrite to ProjectRoot path
                        path = path[0] === "/" ? projectRoot + path : docRoot + path;
                        path = _resolvePath(path);
                        deps.push(path);
                    }
                }
            });
    
            self._deps = deps;
            
            this.resolve();
        });
    };
    
    /**
     * Construct cache.
     * @private
     * @param {string} content
     */
    HTMLCache.prototype._fetchRules = function (content) {
        var self        = this;
        
        return $.Deferred(function () {
            var styles  = content.match(/<style ?.*>[\s\S]*?<\/style>/gi) || [],
                que     = [];
            
            if (!styles.length) { this.resolve(); }
            
            styles = $.parseHTML(styles.join(""));
            if (styles) {
                $.each(styles, function (index, style) {
                    // load style
                    var loadDfd = ElementLoader.load(style)
                        .done(function () {
                            self.parseStyleRule(style.sheet.rules, style);
                            style.remove();
                        });

                    que.push(loadDfd);
                });
            }
            
            $.when.apply(null, que)
                .done(this.resolve.bind(this));
        });
    };
    
    /**
     * Fetch and parse HTML Content
     */
    HTMLCache.prototype.fetch = function () {
        var self = this;
        
        this.clearCache();
        
        FileUtils.readAsText(this._file)
            .then(function (content) {
                return $.when(
                    self._surveyDependent(content),
                    self._fetchRules(content)
                );
            })
            .done(function () {
                self._lastUpdateCheck = new Date();
                $(self).trigger("fetchEnd");
            });
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
        this.parentClass.dispose.call(this);
        
        this._deps = null;
        this._file = null;
    };
    
    return HTMLCache;
});
