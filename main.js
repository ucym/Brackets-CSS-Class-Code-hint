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
/*global define, brackets, $, window, document */

define(function (require, exports, module) {
    "use strict";
    
    var AppInit         = brackets.getModule("utils/AppInit"),
        CodeHintManager = brackets.getModule("editor/CodeHintManager"),
        HTMLUtils       = brackets.getModule("language/HTMLUtils"),
        CacheManager    = require("CacheManager");
    
    var _supports            = JSON.parse(require("text!support.json")).htmlAttrs;
    
    /**
     * @constructor
     */
    function ClassHints() {
        this.editor = null;
    }
    
    /**
     * @param {Editor} editor
     * @param {string} implicitChar
     * @return {boolean}
     */
    ClassHints.prototype.hasHints = function (editor) {
        this.editor = editor;
        
        var tagInfo     = HTMLUtils.getTagInfo(editor, editor.getCursorPos()),
            tokenType   = tagInfo.position.tokenType,
            attrName    = tagInfo.attr.name.toLowerCase(),
            query;
        
        // unsupported is reject
        if (tokenType !== HTMLUtils.ATTR_VALUE || !_supports[attrName]) {
            return false;
        }
        
        return true;
    };
    
    /**
     * @param {string} implicitChar
     * @return {Object.<string, Object>}
     */
    ClassHints.prototype.getHints = function () {
        var tagInfo     = HTMLUtils.getTagInfo(this.editor, this.editor.getCursorPos()),
            tokenType   = tagInfo.position.tokenType,
            attrName    = tagInfo.attr.name.toLowerCase();
        
        // unsupported is reject
        if (tokenType !== HTMLUtils.ATTR_VALUE || !_supports[attrName]) {
            return;
        }
        
        if (attrName === "class") {
            return this._getClassHints(tagInfo);
        } else if (attrName === "id") {
            return this._getIdHints(tagInfo);
        }
    };
    
    /**
     * Get hints for class attribute
     * @param {TagInfo} tagInfo
     * @return {Object.<string, Object>}
     */
    ClassHints.prototype._getClassHints = function (tagInfo) {
        var attrValue   = tagInfo.attr.value,
            attrOffset  = tagInfo.position.offset;
            
        var query       = [],
            ignore      = {},
            result      = [],
            recentSpPos = -1,
            candidate,
            i;
        
        if (tagInfo.position.offset >= 0) {
            // Decide ignore class names
            $.each(attrValue.split(" "), function () { ignore[this] = true; });
            
            // Decide query
            // find recent "space" position
            for (i = attrOffset - 1; i >= 0; i--) {
                if (attrValue[i] === " ") { i++; break; }
            }
            recentSpPos = i === -1 ? 0 : i;
            query = attrValue.slice(recentSpPos, attrOffset);
            
            // Delete typing class name from ignore list.
            i = 0;
            $.each(ignore, function (key) {
                i += (i > 1 ? 1 : 0) + key.length;
                
                if (i >= recentSpPos && key === query) {
                    delete ignore[key];
                    return false;
                }
            });
        }
        
        // search
        candidate = CacheManager.searchClass(this.editor.document, query, tagInfo.tagName, ignore);
        
        // override brackets highlight
        var queryMathcer    = new RegExp("(" + query + ")", "i"),
            template        = "<span style='color:#a7a7a7;' data-element=':element:' data-class=':class:'>:element:.</span>:matchedclass:",
            highlight       = function (className, tagName) {
                return template
                        .replace(/:element:/g, tagName).replace(/:class:/g, className)
                        .replace(/:matchedclass:/g, className.replace(queryMathcer, "<b>$1</b>"));
            };
        
        $.each(candidate.specific, function () { result.push(highlight(this, tagInfo.tagName)); });
        $.each(candidate.general, function () { result.push(highlight(this, "*")); });
        
        result = result.filter(function (obj, index) { return index < 200; });
        
        return {
            hints: result,
            selectInitial: true
        };
    };
    
    /**
     * Get hints for id attribute
     * @param {TagInfo} tagInfo
     * @return {Object.<string, Object>}
     */
    ClassHints.prototype._getIdHints = function (tagInfo) {
        var attrValue   = tagInfo.attr.value,
            query       = [];
        
        if (tagInfo.position.offset >= 0) {
            query = attrValue;
        }
        
        return {
            hints: CacheManager.searchId(this.editor.document, query),
            query: query,
            selectInitial: true
        };
    };
    
    
    /**
     * @param {string} completion
     */
    ClassHints.prototype.insertHint = function (completion) {
        var cursor      = this.editor.getCursorPos(),
            tagInfo     = HTMLUtils.getTagInfo(this.editor, cursor),
            tokenType   = tagInfo.position.tokenType;
        
        if (tokenType === HTMLUtils.ATTR_VALUE) {
            if (tagInfo.attr.name.toLowerCase() === "class") {
                this._insertClassHint(completion, cursor, tagInfo);
            } else if (tagInfo.attr.name.toLowerCase() === "id") {
                this._insertIdHint(completion, cursor, tagInfo);
            }
        }
    };
    
    /**
     * @param {string} completion
     * @param {{line:Number, ch:Number}} cursor
     * @param {TagInfo} tagInfo
     */
    ClassHints.prototype._insertClassHint = function (completion, cursor, tagInfo) {
        var start       = {line: cursor.line, ch: -1},
            end         = {line: cursor.line, ch: -1},
            
            attrValue   = tagInfo.attr.value,
            attrOffset  = tagInfo.position.offset,
            attrStartPos = cursor.ch - attrOffset,
            quoteAppended = false,
            lastSpPos,
            i;
        
        completion = String(completion).match(/data\-class='(.+)'/)[1];
        
        // find recent "space" position
        for (i = attrOffset - 1; i >= 0; i--) {
            if (attrValue[i] === " ") { i++; break; }
        }
        lastSpPos = i === -1 ? 0 : i;
        
        // hasnt quote
        if (tagInfo.attr.hasEndQuote === false) {
            if (tagInfo.attr.quoteChar === "") {
                completion = "\"" + completion + "\"";
            } else {
                completion = completion + tagInfo.attr.quoteChar;
            }
            
            quoteAppended = true;
        }
        
        start.ch = attrStartPos + lastSpPos; // attrPos + typed classes length
        end.ch = start.ch + (attrOffset - lastSpPos); // startPos + already typed
        
        if (start.ch === end.ch) {
            this.editor.document.replaceRange(completion, start);
        } else {
            this.editor.document.replaceRange(completion, start, end);
        }
        
        this.editor.setCursorPos(start.line, start.ch + completion.length - quoteAppended);
    };
    
    /**
     * @param {string} completion
     * @param {{line:Number, ch:Number}} cursor
     * @param {TagInfo} tagInfo
     */
    ClassHints.prototype._insertIdHint = function (completion, cursor, tagInfo) {
        var start       = {line: -1, ch: -1},
            end         = {line: -1, ch: -1},
            attrOffset  = tagInfo.position.offset,
            attrStartPos = cursor.ch - attrOffset,
            quoteAppended = false;
        
        // hasnt quote
        if (tagInfo.attr.hasEndQuote === false) {
            if (tagInfo.attr.quoteChar === "") {
                completion = "\"" + completion + "\"";
            } else {
                completion = completion + tagInfo.attr.quoteChar;
            }
            
            quoteAppended = true;
        }
        
        start.line = end.line = cursor.line;
        start.ch = attrStartPos; // attrStartPos
        end.ch = start.ch + (cursor.ch - start.ch); // startPos + already typed
        
        if (start.ch === end.ch) {
            this.editor.document.replaceRange(completion, start);
        } else {
            this.editor.document.replaceRange(completion, start, end);
        }
        
        this.editor.setCursorPos(start.line, start.ch + completion.length - quoteAppended);
    };
    
    // Register code hinter
    AppInit.appReady(function () {
        var classHints = new ClassHints();
        CodeHintManager.registerHintProvider(classHints, ["html"], 5);
    });
});
