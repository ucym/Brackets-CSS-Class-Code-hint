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
/*global define, brackets, $, window, CSSStyleRule, document */
define(function (require, exports, module) {
    "use strict";

    var AppInit             = brackets.getModule("utils/AppInit"),
        FileUtils           = brackets.getModule("file/FileUtils"),
        ProjectManager      = brackets.getModule("project/ProjectManager"),
        EditorManager       = brackets.getModule("editor/EditorManager"),
        DocumentManager     = brackets.getModule("document/DocumentManager"),
        NativeFileSystem    = brackets.getModule("file/NativeFileSystem").NativeFileSystem;

    var instance_Cacher     = null,
        elementLoader       =
            (function () {
                var loader = document.createElement("iframe");
                loader.setAttribute("href", "about:blank");
                loader.style.display = "none";
                document.body.appendChild(loader);
                
                return loader.contentDocument.head;
            })();

////////////////////////////////
    
    /**
     * Collection of class name & id
     * @constructor
     */
    function StyleCache() {
        this._classes = {
            // tagName: ['classes', 'classes'....]
        };
        
        this._ids = [];
    }
    
    /**
     * Add cache from CSSRuleList parse result
     *
     * @param {CSSRuleList} rules
     */
    StyleCache.prototype.parseStyleRule = function (rules) {
        var self = this;

        // filter no style rules
        var styleRules;
        styleRules = Array.prototype.filter.call(rules, function (rule) {
            return rule.type === CSSStyleRule.prototype.STYLE_RULE;
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
        var splited, tagName, classNames;
        $.each(spaceSeparated, function (i, selector) {
            if (selector === "") {return; }

            // 擬似要素、擬似クラス、子孫セレクタを削除
            selector = selector.replace(/::?.+/g, "").replace(/\[.+\]/g, "").replace(/[>+]/g, "");
            // タグ名とクラス名を分離
            splited = selector.split(".");
            tagName = splited.shift();
            classNames = splited;
            
            // タグ名がIDならID候補を追加
            if (tagName[0] === "#") {
                self.addId(tagName.substr(1));
            }
            
            // クラス名が残っていれば, クラスを追加
            if (classNames.length) {
                tagName = tagName === "*" ? "" : tagName || "";
                
                classNames.forEach(function (className) {
                    self.addClass(className, tagName);
                });
            }
        });
    };
    
    /**
     * @param {String} className
     * @param {?String} tagName
     */
    StyleCache.prototype.addClass = function (className, tagName) {
        tagName = !tagName ? "" : tagName;
        
        // 配列を初期化する
        this._classes[tagName] = this._classes[tagName] || [];
        
        if (this._classes[tagName].length === 0 || this._classes[tagName].indexOf(className) === -1) {
            this._classes[tagName].push(className);
        }
    };
    
    /**
     * add id candidate
     *
     * @param {String} idName
     */
    StyleCache.prototype.addId = function (idName) {
        this._ids.push(idName);
    };
    
    /**
     * search query matched class
     *
     * @param {String} query
     * @param {String} tagName
     * @param {?{className:Boolean}} ignore
     * @return {Array.<String>}
     */
    StyleCache.prototype.searchClass = function (query, tagName, ignore) {
        var matcher = new RegExp(query),
            result  = [];
        ignore = ignore || {};
        
        if (!this._classes[tagName]) { return result; }
        
        this._classes[tagName].forEach(function (className) {
            if (ignore[className] !== true && className.match(query)) { result.push(className); }
        });
        
        return result;
    };
    
    /**
     * Search query matched id
     *
     * @param {String} query
     * @return {Array.<String>}
     */
    StyleCache.prototype.searchId = function (query) {
        var matcher = new RegExp(query),
            result  = [];
        
        this._ids.forEach(function (id) {
            if (id.match(query)) { result.push(id); }
        });
        
        return result;
    };
    
    /**
     * Dispose object
     */
    StyleCache.prototype.dispose = function () {
        this._classes = null;
        this._ids = null;
    };
////////////////////////////////
    /**
     * @constructor
     * @param {Document}
     */
    function FileCache(document) {
        // private
        Object.defineProperty(this, "_document", {
            value: document,
            writable: false
        });
        
        this._styleCache = new StyleCache();
        
        //public
        Object.defineProperty(this, "fullPath", {
            value: document.file.fullPath,
            writable: false
        });
        Object.defineProperty(this, "timestamp", {
            value: document.diskTimestamp,
            writable: false
        });
        
        this._dependentFilesCache = null;
        
        // スタイル要素のキャッシュを作成する
        this._createStyleCache();
    }
    
    /***
     * FileCache properties
     ***/
    // private
    FileCache.prototype._document       = null;
    FileCache.prototype._styleCache     = null;
    FileCache.prototype._dependentFilesCache = null;
    
    // public
    FileCache.prototype.fullPath    = null;
    FileCache.prototype.timestamp   = null;
    
    /**
     * fix relative url
     * @param {String} url
     */
    function _parseUrl(url) {
        var stack = [];
        url.split("/").forEach(function (v, i) {
            if (v === "..") {
                stack.pop();
            } else if (v !== ".") {
                stack.push(v);
            }
        });
        
        return stack.join("/");
    }
    
    /***
     * FileCache private methods
     * 
     ***/
    /**
     * Construct style cache
     *
     * @param {Function} callback
     */
    FileCache.prototype._createStyleCache = function (callback) {
        var self        = this,
            document    = this.getText(),
            styles      = document.match(/<style>[\s\S]*?<\/style>/gi) || [];
        
        // style要素がなければ終了
        if (!styles.length) {return; }
        
        styles = $.parseHTML(styles.join(""));
        styles.forEach(function (style, index) {
            var deferred = $.Deferred();
            
            // load style
            style.addEventListener("load", function () { deferred.resolve(); }, false);
            elementLoader.appendChild(style);
            
            deferred.done(function () {
                self._styleCache.parseStyleRule(style.sheet.rules);
                
                style.remove();
                style = null;
                
                if (index === styles.length - 1 && typeof callback === "function") {
                    callback();
                }
            });
        });
    };
    
    /***
     * FileCache Public Methods
     *
     ***/
    /**
     * get contents as text
     * ファイル内のテキストを取得します。
     *
     * @return {String}
     */
    FileCache.prototype.getText = function () {
        return this._document.getText();
    };
    
    /**
     * Get dependence files absolute path
     * 依存ファイル(CSS)を絶対パスで取得します。
     *
     * @return {Array.<String>}
     */
    FileCache.prototype.getDependenceFiles = function () {
        if (this._dependentFilesCache) {return this._dependentFilesCache; }
        
        // キャッシュがなかったら構築
        var projectRoot = ProjectManager.getProjectRoot().fullPath,
            docRoot  = this.fullPath.substr(0, this.fullPath.lastIndexOf("/") + 1),
            depends = [],
            links   = this.getText().match(/<link .*[ ]?href=["|'](.+)["|'].*>/g) || [];
        
        // ファイル内から抽出したLink要素から絶対パスを推測
        links.forEach(function (link) {
            var path = _parseUrl(link.match(/href=['"](.+?)['"]/)[1]);
            path = path[0] === "/" ? projectRoot + path : docRoot + path;
            depends.push(path);
        });
        
        // 依存ファイルキャッシュを作成
        this._dependentFilesCache = depends;
        
        return this._dependentFilesCache;
    };
    
    /**
     * search query matched class
     *
     * @param {String} query
     * @param {String} tagName
     * @param {?{className:Boolean}} ignore
     * @return {Array.<String>}
     */
    FileCache.prototype.searchClass = function (query, tagName, ignore) {
        return this._styleCache.searchClass(query, tagName, ignore);
    };
    
    /**
     * Search query matched id
     *
     * @param {String} query
     * @return {Array.<String>}
     */
    FileCache.prototype.searchId = function (query) {
        return this._styleCache.searchId(query);
    };
    
    /**
     * Dispose object
     *
     * @return {void}
     */
    FileCache.prototype.dispose = function () {
        this._dependentFilesCache = null;
    };
////////////////////////////////
    
    /**
     * @constructor
     * @param {String} path  css file path
     */
    function CSSCache(path, callback) {
        var self        = this,
            deferred    = $.Deferred();
        
        // public
        this.deferred = deferred.promise();
        Object.defineProperty(this, "fullPath", {
            value: path,
            writable: false
        });
        
        // private
        this._styleCache = new StyleCache();
        
        // Loading file
        NativeFileSystem
            .resolveNativeFileSystemPath(
                this.fullPath,
                function (fileEntry) { self._fetch(deferred, fileEntry); },
                function () { self.__onfail(arguments); }
            );
        
        // on cache end invoke callback
        deferred.done(function () {
            if (typeof callback === "function") { callback.apply(self); }
        });
    }
    
    // private property
    CSSCache.prototype._classes = null;
    CSSCache.prototype._ids = null;
    
    // public property
    CSSCache.prototype.fullPath     = null;
    CSSCache.prototype.timestamp    = null;
    CSSCache.prototype.deferred     = null;
    
    // private static property
    CSSCache._loader = elementLoader;
    
    /***
     * CSSCache private method
     *
     ***/
    /**
     * Load CSS and Cache
     * @private
     * @param {$.Deferred} deferred
     * @param {FileEntry} file
     */
    CSSCache.prototype._fetch = function (deferred, file) {
        var self    = this,
            style   = null,
            onload  = $.Deferred();
        
        // Get last update date
        file.getMetadata(function (meta) {
            Object.defineProperty(self, "timestamp", {value: meta.modificationTime, writable: false});
        });
        
        // Read file contents
        FileUtils
            .readAsText(file)
            .done(function (content) {
                style = document.createElement("style");
                style.innerHTML = content;
                style.addEventListener("load", function () { onload.resolve(); });
                CSSCache._loader.appendChild(style);
            });
        
        // End read file then cache style rules
        onload.done(function () {
            // スタイルルールからキャッシュを作成
            self._styleCache.parseStyleRule(style.sheet.rules);
            
            // clear dom element
            style.remove();
            style = null;
            
            // CSSCache onload
            deferred.resolve();
        });
    };
    
    /***
     * CSSCache public method
     *
     ***/
    /**
     * search query matched class
     *
     * @param {String} query
     * @param {String} tagName
     * @param {?{className:Boolean}} ignore
     * @return {Array.<String>}
     */
    CSSCache.prototype.searchClass = function (query, tagName, ignore) {
        return this._styleCache.searchClass(query, tagName, ignore);
    };
    
    /**
     * Search query matched id
     *
     * @param {String} query
     * @return {Array.<String>}
     */
    CSSCache.prototype.searchId = function (query) {
        return this._styleCache.searchId(query);
    };
    
    /**
     * Dispose object
     */
    CSSCache.prototype.dispose = function () {
        this.deferred   = null;
        this._styleCache.dispose();
        this._styleCache = null;
    };
    
    /***
     * CSSCache listener method
     *
     ***/
    /**
     * NativeFileSystem failed callback
     */
    CSSCache.prototype.__onfail = function () {};
////////////////////////////////
    /**
     * @constructor
     */
    function Cacher() {
        instance_Cacher = this;
        this._initialize();
    }
    
    /***
     * Cacher private method
     *
     ***/
    /**
     * キャッシュの初期化など
     */
    Cacher.prototype._initialize = function () {
        if (this._cssCaches) {
            $.each(this._cssCaches, function (path) { this.dispose(); });
        }
        
        if (this._documentCaches) {
            $.each(this._documentCaches, function () { this.dispose(); });
        }
        
        // HTMLファイルのキャッシュ
        this._documentCaches = {};
        // CSSファイルのキャッシュ
        this._cssCaches = {};
    };
    
    /**
     * add document to document cache.
     *
     * @param {Document} document
     */
    Cacher.prototype._addDocumentCache = function (document) {
        var fullPath    = document.file.fullPath,
            oldCache    = this._documentCaches[fullPath],
            fileCache = new FileCache(document);
        
        // ドキュメントがキャッシュ済みで更新されていなければ更新停止
        if (oldCache && fileCache.timestamp <= oldCache.timestamp) { return;}
        
        // キャッシュを追加
        this._documentCaches[fullPath] = fileCache;
        
        // 依存ファイル(CSS)をキャッシュ
        var self     = this,
            depends  = fileCache.getDependenceFiles();
        depends.forEach(function (path) {
            self._addCSSCache(path);
        });
    };
    
    /**
     * Cache css file
     * @param {String} path  fullPath
     */
    Cacher.prototype._addCSSCache = function (path) {
        var self = this,
            oldCache = this._cssCaches[path],
            cssCache;
            
        cssCache = new CSSCache(path, function () {
            if (oldCache && oldCache.timestamp >= cssCache.timestamp) { return;}
            
            self._cssCaches[path] = cssCache;
        });
    };
    
    /***
     * Cacher public method
     *
     ***/
    /**
     * 依存ファイルとクエリに一致するクラス名一覧を取得します
     *
     * @param {Document} document
     * @param {String} query
     * @param {String} tagName
     * @param {?{className:Boolean}} ignore
     * @return {{specific:Array.<String>, general:Array.<String>}}
     */
    Cacher.prototype.searchClass = function (document, query, tagName, ignore) {
        var self        = this,
            filePath    = document.file.fullPath,
            depends     = null,
            candidates  = {specific: [], general: []},
            matches     = [];
        
        tagName = !tagName ? "" : tagName;
        ignore = ignore || {};
        
        // HTMLの依存ファイルを抽出する
        if (this._documentCaches[filePath]) {
            depends = this._documentCaches[filePath].getDependenceFiles();
        } else {
            // 依存ファイルが取れなかったらとりあえずキャッシュ済みの全ファイルを対象
            depends = [];
            $.each(this._cssCaches, function (filePath) {
                depends.push(filePath);
            });
        }
        
        // HTML内のstyle要素から検索
        if (self._documentCaches[filePath]) {
            // 要素非依存のクラスを検索
            Array.prototype.push.apply(candidates.general, self._documentCaches[filePath].searchClass(query, "", ignore));
            
            // 要素依存のクラスを検索
            if (tagName !== "") {
                Array.prototype.push.apply(candidates.specific, self._documentCaches[filePath].searchClass(query, tagName, ignore));
            }
        }
        
        // キャッシュから候補を検索
        $.each(depends, function (index, filePath) {
            // 要素非依存のクラスを検索
            Array.prototype.push.apply(candidates.general, self._cssCaches[filePath].searchClass(query, "", ignore));
            
            // 要素依存のクラスを検索
            if (tagName !== "") {
                Array.prototype.push.apply(candidates.specific, self._cssCaches[filePath].searchClass(query, tagName, ignore));
            }
        });
        
        return candidates;
    };
    
    /**
     * @param {Document} document
     * @param {String} query
     */
    Cacher.prototype.searchId = function (document, query) {
        var self        = this,
            filePath    = document.file.fullPath,
            depends     = null,
            matches     = [];
        
        // HTMLの依存ファイルを抽出する
        if (this._documentCaches[filePath]) {
            depends = this._documentCaches[filePath].getDependenceFiles();
        } else {
            // 依存ファイルが取れなかったらキャッシュ済みの全ファイルを対象
            depends = [];
            $.each(this._cssCaches, function (filePath) {
                depends.push(filePath);
            });
        }
        
        // HTML内のstyle要素から検索
        if (self._documentCaches[filePath]) {
            Array.prototype.push.apply(matches, self._documentCaches[filePath].searchId(query));
        }
        
        // キャッシュから候補を検索
        $.each(depends, function (index, filePath) {
            Array.prototype.push.apply(matches, self._cssCaches[filePath].searchId(query));
        });
        
        return matches;
    };
    
    /***
     * Cacher event listeners
     *
     ***/
    /**
     * Editor change event listener
     * ファイルが開かれた時に、ファイル内容を解析してキャッシュを行う
     *
     * @param {Editor} editor  active editor
     */
    Cacher.prototype.__editorChange = function (editor) {
        if (!editor) {return; }
        if (editor.getModeForSelection() !== "html") {return; }
        
        // ドキュメントをキャッシュに追加する
        this._addDocumentCache(editor.document);
    };
    
    /**
     * File save event listener
     * ファイルの再キャッシュを行います。
     *
     * @param {Document} document
     */
    Cacher.prototype.__fileSave = function (document) {
        if (!document) {return; }
        
        // Cache reconstruct
        if (document._masterEditor.getModeForSelection() === "html") {
            this._addDocumentCache(document);
        }
        
        // 
        if (document._masterEditor.getModeForSelection() === "css") {
            this._addCSSCache(document.file.fullPath);
        }
    };
    
    // construct
    instance_Cacher = new Cacher();
    
////////////////////////////////

    AppInit.appReady(function () {
        // Editor change listener
        instance_Cacher.__editorChange(EditorManager.getActiveEditor());
        $(EditorManager).on("activeEditorChange", function () {
            instance_Cacher.__editorChange(this.getActiveEditor());
        });
        
        // Project change listener
        $(ProjectManager).on("projectOpen", function () {
            instance_Cacher._initialize();
        });
        
        // File save listener
        $(DocumentManager).on("documentSaved", function (event, document) {
            instance_Cacher.__fileSave(document);
        });
    });

////////////////////////////////
    
    return instance_Cacher;
});