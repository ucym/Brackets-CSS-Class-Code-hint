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

    var CSSCache        = require("CSSCache"),
        Directory       = brackets.getModule("filesystem/Directory"),
        DocumentManager = brackets.getModule("document/DocumentManager"),
        EditorManager   = brackets.getModule("editor/EditorManager"),
        FileSystem      = brackets.getModule("filesystem/FileSystem"),
        File            = brackets.getModule("filesystem/File"),
        HTMLCache       = require("HTMLCache"),
        ProjectManager  = brackets.getModule("project/ProjectManager");
    
    var _instance      = null,
        cssExt         = /\.css/i;

    /**
     * @constructor
     *
     * Roles
     *  1. Search CSS className or ID from cache.
     *      - Search by considering the dependency of HTML and CSS.
     *  2. StyleRuleCache construction
     *      - Preload project contains css.
     *      - Load HTML dependencies CSS on outside of project dir.
     *      - Construct cache on project change and active editor change.
     */
    function CacheManager() {
        if (this._CSSCaches) {
            $.each(this._CSSCaches, function () { this.dispose(); });
        }
        
        if (this._HTMLCaches) {
            $.each(this._HTMLCaches, function () { this.dispose(); });
        }
        
        this._HTMLCaches    = {};
        this._CSSCaches     = {};
    }
    
    /**
     * HTMLCache list.
     * @type {Object.<string, HTMLCache>} {"fullPath": HTMLCache Object ...}
     */
    CacheManager.prototype._HTMLCaches    = null;
    
    /**
     * CSSCache list
     * @type {Object.<string, CSSCache>} {"fullPath": CSSCache Object...}
     */
    CacheManager.prototype._CSSCaches     = null;
    
    /**
     * Initialize CacheManager
     */
    CacheManager.prototype._initialize = function () {
        CacheManager.apply(this);
    };
    
    /**
     * Search StyleRuleCache Object from full path.
     * @param {string}
     * @return {StyleRuleCache}
     */
    CacheManager.prototype._searchCache = function (filePath) {
        return this._HTMLCaches[filePath] || this._CSSCaches[filePath];
    };
    
    /**
     * Remove and dispoce cache object from full path.
     * @param {string} filePath
     */
    CacheManager.prototype._removeCache = function(filePath) {
        var cache = this._HTMLCaches[filePath] || this._CSSCaches[filePath];
        cache.dispose();
        
        delete this._HTMLCaches[filePath];
        delete this._CSSCaches[filePath];
    };
    
    /**
     * @param {File|string} file
     * @param {Object} storage
     * @param {function(File):Object} Class
     * @return {$.Deferred} done arguments (ClassInstance:Class, isNew:boolean)
     */
    CacheManager.prototype._createCache = function (file, storage, Class) {
        return $.Deferred(function (dfd) {
            var instance = storage[typeof file === "string" ? file : file.fullPath];
            
            if (instance) {
                dfd.resolve(instance, false);
                return;
            }
            
            if (typeof file === "string") {
                FileSystem.resolve(file, function (err, entry) {
                    if (!err) {
                        dfd.resolve(new Class(entry), true);
                    } else {
                        console.warn("CacheManager: File read error. %s (file: %s)", err, file);
                    }
                });
            } else if (file instanceof File) {
                dfd.resolve(new Class(file), true);
            }
        })
            .done(function (instance, isNew) {
                if (isNew === false) { instance.fetch(); }
                storage[instance.fullPath] = instance;
                
                $(instance).on("disposed", function () {
                    delete storage[instance.fullPath];
                });
            })
            .promise();
    };
    
    /**
     * Construct HTMLCache.
     * @param {string|File} file
     * @param {Document} document
     */
    CacheManager.prototype.createHTMLCache = function (file) {
        var self = this;
        
        this._createCache(file, this._HTMLCaches, HTMLCache)
            .done(function (htmlCache, isNew) {
                if (isNew) {
                    $(htmlCache).on("fetchEnd", function () {
                        $.each(this.deps, function () {
                            self.createCSSCache(this);
                        });
                    });
                } else {
                    htmlCache.fetch();
                }
            });
    };
    
    /**
     * Construct CSSCache
     * @param {string|File} file
     */
    CacheManager.prototype.createCSSCache = function (file) {
        this._createCache(file, this._CSSCaches, CSSCache)
            .done(function (cssCache, isNew) {
                if (!isNew) {
                    cssCache.fetch();
                }
            });
    };
    
    /**
     * Search the class name associated with the HTML from all cache.
     * @param {Document} document
     * @param {string} query
     * @param {string} tagName
     * @param {?Object,<string, boolean>} ignore
     * @return {{specific:Array.<string>, general:Array.<string>}}
     */
    CacheManager.prototype.searchClass = function (document, query, tagName, ignore) {
        var Arr         = Array.prototype,
            self        = this,
            htmlCache   = this._HTMLCaches[document.file.fullPath],
            deps        = htmlCache && htmlCache.deps,
            candidates  = {specific: [], general: []},
            targets     = [];
        
        tagName = !tagName ? "" : tagName;
        ignore = ignore || {};
        
        if (!deps || deps.length === 0) {
            // if dependent files doesn't listed, search all css in projects.
            deps = $.map(this._CSSCaches, function (obj, key) { return key; });
        }
        
        // Add current HTML to search que.
        if (htmlCache) {
            targets.push(htmlCache);
        }
        
        // Add dependent CSS to search que.
        Arr.push.apply(
            targets,
            $.map(deps, function (filePath) {
                return self._CSSCaches[filePath] || null;
            })
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
     * @param {Document} document
     * @param {string} query
     */
    CacheManager.prototype.searchId = function (document, query) {
        var Arr         = Array.prototype,
            self        = this,
            htmlCache   = this._HTMLCaches[document.file.fullPath],
            depends     = htmlCache && htmlCache.deps,
            targets     = [],
            matches     = [];
        
        // Add current HTML to search que.
        if (htmlCache) {
            targets.push(htmlCache);
        }
        
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
     * Preload CSS file in the project dir.
     */
    function _projectOpenHandler() {
        var prjRoot     = ProjectManager.getProjectRoot(),
            cssFiles    = [];
        
        _instance._initialize();
        
        /**
         * Search css file from directory
         * @param {Directory} dir
         */
        function pickCssFromDirEntry(dir) {
            var dfd         = $.Deferred(),
                dirSearcher = [];
            
            // get Directory content.
            dir.getContents(function (err, entries) {
                $.each(entries, function (index, entry) {
                    if (entry.isFile && cssExt.test(entry.name)) {
                        // if file is css, add CSS file list
                        cssFiles.push(entry);
                    }
                    
                    if (entry.isDirectory) {
                        dirSearcher.push(pickCssFromDirEntry(entry));
                    }
                });
                
                // All deferred task completed
                $.when.apply(null, dirSearcher)
                    .done(dfd.resolve.bind(dfd, cssFiles));
            });

            return dfd.promise();
        }
        
        // Search css file from Project directory
        pickCssFromDirEntry(prjRoot)
            .done(function (entries) {
                // cache CSS
                $.each(entries, function () {
                    _instance.createCSSCache(this);
                });
            });
    }
    
    /**
     * Analysis opened HTML
     * @param {$.Event} e  Event
     * @param {Editor} editor  Activated editor
     */
    function _editorChangeHandler(e, editor) {
        if (!editor || editor.getModeForSelection() !== "html") { return; }
        
        _instance.createHTMLCache(editor.document.file);
    }
    
    /**
     * Update cache on document update
     * @param {$.Event} e  Event
     * @param {Document} document
     */
    function _documentUpdateHandler(e, document) {
        var cache = _instance._searchCache(document.file.fullPath);
        
        if (cache) {
            cache.fetch();
        }
    }
    
    /**
     * New CSS detection and construction cache.
     * @param {File|Directory} change
     * @param {Array.<File|Directory>} added
     * @param {Arrau.<File|Directoru>} removed
     */
    function _fsChangeHandler(e, change, added, removed) {
        var filterOnlyCSS = function (entry) { return entry.isFile && cssExt.test(entry.name); };
        
        if (change.isDirectory) {
            added = added.filter(filterOnlyCSS);
            removed = removed.filter(filterOnlyCSS);
            
            $.each(added, function () {
                _instance.createCSSCache(this);
                console.log("new css detected: %c%s", "color:blue", this.name);
            });
            $.each(removed, function () {
                _instance._removeCache(this.fullPath);
                console.log("css file removed: %c%s", "color:red", this.name);
            });
        }
    }
    
    
    // Listen editor change event for HTMLParse and Caching.
    //_instance.__editorChange(EditorManager.getActiveEditor());
    $(EditorManager).on("activeEditorChange", _editorChangeHandler);
    
    // Listen projectOpen event for Initialize cache and precache css.
    $(ProjectManager).on("projectOpen projectRefresh", _projectOpenHandler);
    
    // Listen document update event
    $(DocumentManager).on("documentSaved documentRefreshed", _documentUpdateHandler);
    
    // Listen FileSystem change event
    FileSystem.on("change", _fsChangeHandler);
    
    // construct
    _instance = new CacheManager();
    
    return _instance;
});