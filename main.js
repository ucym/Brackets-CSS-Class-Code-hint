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
    
    var AppInit             = brackets.getModule("utils/AppInit"),
        CodeHintManager     = brackets.getModule("editor/CodeHintManager"),
        HTMLUtils           = brackets.getModule("language/HTMLUtils"),
        Cacher              = require("cache");
    
    var _supports            = JSON.parse(require("text!support.json")).htmlAttrs;
    
    /**
     * @constructor
     */
    function ClassHints() {
        this.editor = null;
    }
    
    /**
     * @param {Editor} editor
     * param {String} implicitChar
     *
     * @return {Boolean}
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
     * @param {String} implicitChar
     * @return {(Object + jQuery.Deferred)<hints: Array<(String + jQuery.Obj)>, match: String, selectInitial: Boolean>}
     */
    ClassHints.prototype.getHints = function () {
        console.time("hint response");
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
     *
     * @param {TagInfo} tagInfo
     * @return {(Object + jQuery.Deferred)<hints: Array<(String + jQuery.Obj)>, match: String, selectInitial: Boolean>}
     */
    ClassHints.prototype._getClassHints = function (tagInfo) {
        var attrValue   = tagInfo.attr.value,
            attrOffset  = tagInfo.position.offset;
            
        var query       = [],
            ignore      = {},
            result      = [],
            lastSpacePos = -1,
            candidate,
            i;
        
        if (tagInfo.position.offset >= 0) {
            // カーソル位置より前の最後のスペース位置
            lastSpacePos = attrValue.lastIndexOf(" ", attrOffset) + 1;
            
            // スペース以降の文字を取り出す
            for (i = lastSpacePos; i < attrOffset; i++) {
                if (attrValue[i] === " ") {break; }
                query.push(attrValue[i]);
            }
            
            // 無視するクラス名を抽出
            attrValue.substr(0, lastSpacePos - 1).split(" ").forEach(function (className) {
                ignore[className] = true;
            });
        }
        
        // search
        query = query.join("");
        candidate = Cacher.searchClass(this.editor.document, query, tagInfo.tagName, ignore);
        
        // override brackets highlight
        var queryMathcer    = new RegExp("(" + query + ")", "i"),
            template        = "<span style='color:#a7a7a7;' data-element=':element:' data-class=':class:'>:element:.</span>:matchedclass:",
            highlight       = function (className, tagName) {
                var str, objective;
                
                str = template
                        .replace(/:element:/g, tagName).replace(/:class:/g, className)
                        .replace(/:matchedclass:/g, className.replace(queryMathcer, "<b>$1</b>"));
                
                objective = Object.apply(str);
                objective.toString = function () { return str; };
                objective.replace = function () {};
                
                return objective;
            };
        
        candidate.specific.forEach(function (className) {
            result.push(highlight(className, tagInfo.tagName));
        });
        candidate.general.forEach(function (className) {
            result.push(highlight(className, "*"));
        });
        
        console.timeEnd("hint response");
        
        return {
            hints: result,
            query: query,
            selectInitial: true
        };
    };
    
    /**
     * Get hints for id attribute
     *
     * @param {TagInfo} tagInfo
     * @return {(Object + jQuery.Deferred)<hints: Array<(String + jQuery.Obj)>, match: String, selectInitial: Boolean>}
     */
    ClassHints.prototype._getIdHints = function (tagInfo) {
        var attrValue   = tagInfo.attr.value,
            query       = [];
        
        if (tagInfo.position.offset >= 0) {
            query = attrValue;
        }
        
        return {
            hints: Cacher.searchId(this.editor.document, query),
            query: query,
            selectInitial: true
        };
    };
    
    
    /**
     * @param {String} completion
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
     * 
     * @param {String} completion
     * @param {{line:Number, ch:Number}} cursor
     * @param {TagInfo} tagInfo
     * @return {void}
     */
    ClassHints.prototype._insertClassHint = function (completion, cursor, tagInfo) {
        var start       = {line: -1, ch: -1},
            end         = {line: -1, ch: -1},
            attrOffset  = tagInfo.position.offset,
            attrStartPos = cursor.ch - attrOffset,
            lastSpacePos = tagInfo.attr.value.lastIndexOf(" ", attrOffset),
            quoteAppended = false;
        
        completion = String(completion).match(/data\-class='(.+)'/)[1];
        
        // hasnt quote
        if (tagInfo.attr.hasEndQuote === false && !tagInfo.attr.quateChar) {
            completion = "\"" + completion + "\"";
            quoteAppended = true;
        }
        
        start.line = end.line = cursor.line;
        start.ch = attrStartPos + lastSpacePos + 1; // attrPos + typed classes length
        end.ch = start.ch + (cursor.ch - start.ch); // startPos + already typed
        
        if (start.ch === end.ch) {
            this.editor.document.replaceRange(completion, start);
        } else {
            this.editor.document.replaceRange(completion, start, end);
        }
        
        this.editor.setCursorPos(start.line, start.ch + completion.length - quoteAppended);
    };
    
    ClassHints.prototype._insertIdHint = function (completion, cursor, tagInfo) {
        var start       = {line: -1, ch: -1},
            end         = {line: -1, ch: -1},
            attrOffset  = tagInfo.position.offset,
            attrStartPos = cursor.ch - attrOffset,
            quoteAppended = false;
        
        // hasnt quote
        if (tagInfo.attr.hasEndQuote === false && !tagInfo.attr.quateChar) {
            completion = "\"" + completion + "\"";
            quoteAppended = true;
        }
        
        start.line = end.line = cursor.line;
        start.ch = attrStartPos; // attrPos + typed classes length
        end.ch = start.ch + (cursor.ch - start.ch); // startPos + already typed
        
        if (start.ch === end.ch) {
            this.editor.document.replaceRange(completion, start);
        } else {
            this.editor.document.replaceRange(completion, start, end);
        }
        
        this.editor.setCursorPos(start.line, start.ch + completion.length - quoteAppended);
    };
    
    
    AppInit.appReady(function () {
        var classHints = new ClassHints();
        CodeHintManager.registerHintProvider(classHints, ["html"], 5);
    });
});
