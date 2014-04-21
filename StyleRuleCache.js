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

/*jslint vars: true, plusplus: true, eqeq: true, devel: true, nomen: true, expr:true, regexp: true, indent: 4, maxerr: 50, eqnull: true*/
/*global define, $, CSSStyleRule, brackets */
define(function (require, exports, module) {
    "use strict";
    
    var StringUtils = brackets.getModule("utils/StringUtils");
    
    /**
     * @constructor
     * 
     * Style rule caches.
     */
    function StyleRuleCache() {
        this._class = {};
        this._id = [];
    }
    
    Object.defineProperties(StyleRuleCache.prototype, {
        "isDisposed": {
            get: function () { return this._class === null || this._id === null; },
            set: function () {}
        }
    });
    
    /**
     * Class names.
     * @type {Object.<string, Array.<string>>}
     */
    StyleRuleCache.prototype._class = null;
    
    /**
     * Ids
     * @type {Array.<string>}
     */
    StyleRuleCache.prototype._id    = null;
    
    /**
     * Construct from CSSRuleList
     *
     * ?Why HTMLStyleElement is required?
     * Webkit style parser replace all class names to lowercase.
     * Cache is search valid class name from style element content.
     *
     * @param {CSSRuleList} rules
     * @param {HTMLStyleElement} style
     */
    StyleRuleCache.prototype.parseStyleRule = function (rules, style) {
        if (this.isDisposed) { return; }
        
        var self        = this,
            styleContent = style.innerText;
        
        // Filter only style rules.
        var styleRules = [];
        $.each(rules, function (i, rule) {
            switch (rule.type) {
                case CSSStyleRule.prototype.MEDIA_RULE:
                    styleRules.push.apply(styleRules, rule.cssRules);
                    break;

                case CSSStyleRule.prototype.STYLE_RULE:
                    styleRules.push(rule);
                    break;
            }
        });

        // separate comma
        var commaSeparated = [];
        $.each(styleRules, function (i, rule) {
            commaSeparated.push.apply(commaSeparated, rule.selectorText.split(","));
        });
        styleRules = null;

        // sepalate space
        var spaceSeparated = [];
        $.each(commaSeparated, function (i, selector) {
            spaceSeparated.push.apply(spaceSeparated, selector.split(" "));
        });
        commaSeparated = null;

        // caching
        var splited, tagName, idName, classNames;
        $.each(spaceSeparated, function (i, selector) {
            if (selector === "") {return; }

            // Delete pseudo-element, pseudo-class, descendant selectors
            selector = selector.replace(/::?.+/g, "").replace(/\[.+\]/g, "").replace(/[>+]/g, "");
            
            // Split to TagName, ClassName
            splited = selector.split(".");
            tagName = splited.shift();
            classNames = splited;
            
            // Split to TagName, ID
            idName = tagName.split("#");
            tagName = idName.shift();
            idName = idName[0];
            
            if (idName) {
                // Search cased id. (Webkit style parser returns lowercase class name and id.)
                idName = StringUtils.regexEscape(idName);
                idName = styleContent.match(new RegExp("#(" + idName + ").*{", "i"));
                idName && self.addId(idName[1]);
            }

            if (classNames.length) {
                tagName = tagName === "*" ? "" : tagName || "";
                
                $.each(classNames, function (i, className) {
                    // Seach cased class name. (Webkit style parser returns lowercase class name and id.)
                    className = StringUtils.regexEscape(className);
                    className = styleContent.match(new RegExp("\\.(" + className + ").*{", "i"));
                    className && self.addClass(className[1], tagName);
                });
            }
        });
    };

    /**
     * Add className to cache.
     * @param {string} className
     * @param {?string} tagName Class dependent tag name.
     */
    StyleRuleCache.prototype.addClass = function (className, tagName) {
        if (this.isDisposed) { return; }
        var classes;
        
        if (tagName == null || tagName === "*") {
            tagName = "";
        }
        
        classes = this._class[tagName] = this._class[tagName] || [];
        
        if (classes.length === 0 || classes.indexOf(className) === -1) {
            classes.push(className);
        }
    };
    
    /**
     * Add id to cache.
     * @param {string} idName
     */
    StyleRuleCache.prototype.addId = function (idName) {
        if (this.isDisposed) { return; }
        
        if (this._id.length === 0 || this._id.indexOf(idName) === -1) {
            this._id.push(idName);
        }
    };
    
    /**
     * search query matched class
     * @param {string} query
     * @param {string} tagName
     * @param {Object.<string, boolean>} ignore ignore class names
     * @return {Array.<string>} matched class names
     */
    StyleRuleCache.prototype.searchClass = function (query, tagName, ignore) {
        if (this.isDisposed) { return []; }
        
        var matcher = new RegExp(StringUtils.regexEscape(query), "i"),
            result  = [];
        ignore = ignore || {};
        
        if (!this._class[tagName]) { return result; }
        
        $.each(this._class[tagName], function (index, className) {
            if (ignore[className] !== true && className.match(matcher)) {
                result.push(className);
            }
        });
        
        return result;
    };
    
    /**
     * Search query matched id
     *
     * @param {string} query
     * @return {Array.<string>} matched id's
     */
    StyleRuleCache.prototype.searchId = function (query) {
        if (this.isDisposed) { return []; }
        
        var matcher = new RegExp(query, "i"),
            result  = [];
        
        $.each(this._id, function () {
            if (this.match(matcher)) { result.push(this); }
        });
        
        return result;
    };
    
    /**
     * Fetching
     */
    StyleRuleCache.prototype.fetch = function () {};
    
    /**
     * Clear cache
     */
    StyleRuleCache.prototype.clearCache = function () {
        this._id    = [];
        this._class = {};
    };
    
    /**
     * Dispose object
     */
    StyleRuleCache.prototype.dispose = function () {
        this._class = null;
        this._id = null;
        
        $(this).trigger("disposed");
    };
    
    return StyleRuleCache;
});
