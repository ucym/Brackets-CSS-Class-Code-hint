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

    var CSSCache        = require("CSSCache"),
        Directory       = brackets.getModule("filesystem/Directory"),
        DocumentManager = brackets.getModule("document/DocumentManager"),
        EditorManager   = brackets.getModule("editor/EditorManager"),
        FileSystem      = brackets.getModule("filesystem/FileSystem"),
        File            = brackets.getModule("filesystem/File"),
        HTMLCache       = require("HTMLCache"),
        ProjectManager  = brackets.getModule("project/ProjectManager");
    
    var _instance      = null;

    /**
     * @constructor
     */
    function Cacher() {
        this._initialize();
    }
    
    /**
     * HTMLCache list.
     * 
     * @type {Object.<string, HTMLCache>} {"fullFilePath": HTMLCache Object ...}
     */
    Cacher.prototype._HTMLCaches    = null;
    
    /**
     * CSSCache list
     *
     * @type {Object.<string, CSSCache>} {"fullFilePAth": CSSCache Object...}
     */
    Cacher.prototype._CSSCaches     = null;
    
    /**
     * Dispose and initialize cache.
     */
    Cacher.prototype._initialize = function () {
        if (this._CSSCaches) {
            $.each(this._CSSCaches, function () { this.dispose(); });
        }
        
        if (this._HTMLCaches) {
            $.each(this._HTMLCaches, function () { this.dispose(); });
        }
        
        this._HTMLCaches = {};
        this._CSSCaches = {};
    };
    
    /**
     * add document to document cache.
     *
     * @param {Document} document
     */
    Cacher.prototype._addDocumentCache = function (document) {
        var htmlCache = new HTMLCache(document);
        
        // Add Cache
        this._HTMLCaches[htmlCache.fullPath] = htmlCache;
        
        // fetch dependent files
        $.each(htmlCache.depends, this._addCSSCache.bind(this));
    };
    
    /**
     * Cache css file
     * @param {String|Array.<File>} path fullPath
     */
    Cacher.prototype._addCSSCache = function (path) {
        var self = this;
        
        if (typeof path === "string") {
            FileSystem.resolve(path, function (err, entry) {
                if (typeof err === "string") {
                    console.error("File read error: " + err, path);
                }
                self._CSSCaches[path] = new CSSCache(entry);
            });
        } else if (path instanceof Array) {
            $.each(path, function () {
                if (this instanceof File) {
                    self._CSSCaches[this.fullPath] = new CSSCache(this);
                }
            });
        }
    };
    
    /**
     * Search the class name associated with the HTML from all cache.
     *
     * @param {Document} document
     * @param {string} query
     * @param {string} tagName
     * @param {?Object,<string, boolean>} ignore
     * @return {{specific:Array.<string>, general:Array.<string>}}
     */
    Cacher.prototype.searchClass = function (document, query, tagName, ignore) {
        var Arr         = Array.prototype,
            self        = this,
            htmlCache   = this._HTMLCaches[document.file.fullPath],
            depends     = htmlCache && htmlCache.depends,
            candidates  = {specific: [], general: []},
            targets     = [];
        
        tagName = !tagName ? "" : tagName;
        ignore = ignore || {};
        
        if (!depends || depends.length === 0) {
            // if dependent files doesn't listed, search all css in projects.
            depends = $.map(this._CSSCaches, function (obj, key) { return key; });
        }
        
        // Add current HTML to search que.
        if (!!htmlCache) { targets.push(htmlCache); }
        
        // Add dependent CSS to search que.
        Arr.push.apply(
            targets,
            $.map(depends, function (filePath) { return self._CSSCaches[filePath] || null; })
        );
        
        $.each(targets, function () {
            // Search tag independent classes
            Arr.push.apply(candidates.general, this.searchClass(query, "", ignore));
            
            // Search tag depenednt classes
            if (tagName !== "") {
                Arr.push.apply(candidates.specific, this.searchClass(query, tagName, ignore));
            }
        });
        
        return candidates;
    };
    
    /**
     * Search the id associated with theHTML from all caches.
     *
     * @param {Document} document
     * @param {String} query
     */
    Cacher.prototype.searchId = function (document, query) {
        var Arr         = Array.prototype,
            self        = this,
            htmlCache   = this._HTMLCaches[document.file.fullPath],
            depends     = htmlCache && htmlCache.depends,
            targets     = [],
            matches     = [];
        
        if (!depends || depends.length === 0) {
            // if dependent files doesn't listed, search all css in projects.
            depends = $.map(this._CSSCaches, function (obj, key) { return key; });
        }
        
        // Add current HTML to search que.
        if (!!htmlCache) { targets.push(htmlCache); }// Arr.push.apply(matches, htmlCache.searchId(query)); }
        
        // Add dependent CSS to search que.
        Arr.push.apply(
            targets,
            $.map(depends, function (filePath) { return self._CSSCaches[filePath] || null; })
        );
        
        // Search id's
        $.each(targets, function () {
            Arr.push.apply(matches, this.searchId(query));
        });
        
        return matches;
    };
    
    /**
     * Project open event listener
     */
    Cacher.prototype.__projectOpen = function () {
        var self            = this,
            prjDirectory    = ProjectManager.getProjectRoot();
        
        /**
         * Search css file from directory
         * @param {Directory} dir
         */
        function pickCssFromDirEntry(dir) {
            var defer       = $.Deferred(),
                dirSearcher = [],
                pickedCSS   = [];
            
            
            dir.getContents(function (result, entries) {
                
                $.each(entries, function () {
                    if (this instanceof Directory) {
                        dirSearcher.push(pickCssFromDirEntry(this));
                    } else if (this instanceof File && !!this.name.match(/.+\.css$/)) {
                        // if file is css, add CSS file list
                        pickedCSS.push(this);
                    }
                });
                
                // All deferred task completed
                $.when.apply($, dirSearcher)
                    .done(function () {
                        $.each(arguments, function () { pickedCSS.push(this); });
                        defer.resolve(pickedCSS);
                    });
            });

            return defer.promise();
        }
        
        // Search css file from Project directory
        pickCssFromDirEntry(prjDirectory)
            .done(function (entries) {
                // cache CSS
                $.each(entries, function () { self._addCSSCache(entries); });
            });
    };
    
    /**
     * When a editor is opened, to cache by parsing the file contents.
     *
     * @param {Editor} editor Active editor
     */
    Cacher.prototype.__editorChange = function (editor) {
        if (!editor || editor.getModeForSelection() !== "html") { return; }
        
        this._addDocumentCache(editor.document);
    };
    
    // construct
    _instance = new Cacher();
    
    // Listen editor change event for HTMLParse and Caching.
    _instance.__editorChange(EditorManager.getActiveEditor());
    $(EditorManager).on("activeEditorChange", function () {
        _instance.__editorChange(this.getActiveEditor());
    });
    
    // Listen projectOpen event for Initialize cache and precache css.
    $(ProjectManager).on("projectOpen projectRefresh", function () {
        _instance._initialize();
        _instance.__projectOpen();
    });
    
    return _instance;
});