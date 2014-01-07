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
/*global define, brackets, $, document, setInterval */
define(function (require, exports, module) {
    "use strict";
    
    var DocumentManager = brackets.getModule("document/DocumentManager"),
        ElementLoader   = require("ElementLoader"),
        FileUtils       = brackets.getModule("file/FileUtils"),
        StyleRuleCache  = require("StyleRuleCache");
    
    var CHECK_INTERVAL  = 20000,
        $checkTrigger   = $({});
    
    
    /**
     * @constructor
     * Roles
     *  1. Parse and holding style rules (class name and id)
     *  2. Document update watching.
     *      - Periodic update check
     *  3. Guarantee the unity of one instance for file.
     *
     * CSS rules cache.
     * @param {File} file
     */
    function CSSCache(file) {
        StyleRuleCache.call(this);
        
        $checkTrigger.on("check", this._checkUpdate.bind(this));
        
        this._file = file;
        this.fetch();
    }
    
    CSSCache.prototype = Object.create(StyleRuleCache.prototype);
    CSSCache.prototype.constructor = CSSCache;
    CSSCache.prototype.parentClass = StyleRuleCache.prototype;
    
    Object.defineProperties(CSSCache.prototype, {
        fullPath: {
            get: function () { return this._file.fullPath; },
            set: function () {}
        },
        timestamp: {
            get: function () { return this._file._stat.mtime; },
            set: function () {}
        }
    });
    
     /**
     * @private
     * @type {File}
     */
    CSSCache.prototype._file        = null;
    
    /**
     * @type {Date}
     */
    CSSCache.prototype.timestamp    = null;
    
    /**
     * @type {Date}
     */
    CSSCache.prototype._lastUpdateCheck = null;
    
    CSSCache.prototype._checkUpdate = function () {
        this._file.stat(function (err, stat) {
            if (stat.mtime > this._lastUpdateCheck) {
                this.fetch();
                console.info("Detect updates: %s", this._file.fullPath);
            }
        }.bind(this));
    };
    
    /**
     * Load CSS and Cache
     *
     * @private
     * @param {function()} callback
     */
    CSSCache.prototype.fetch = function () {
        var self    = this;
        
        // Read file contents
        return FileUtils
            .readAsText(self._file)
            .then(function (content) {
                var style = document.createElement("style");
                style.innerHTML = content;
                
                return ElementLoader.load(style);
            })
            // End read file then cache style rules
            .done(function (style) {
                self.parseStyleRule(style.sheet.rules, style);
                
                // clear dom element
                style.remove();
                
                self._lastUpdateCheck = new Date();
            });
    };
    
    
    // Listen document update events.
    setInterval($.fn.trigger.bind($checkTrigger, "check"), CHECK_INTERVAL);
    
    return CSSCache;
});