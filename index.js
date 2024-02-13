"use strict";
var _loadTypescript = require("@glint/core/lib/common/load-typescript");
var _config = require("@glint/config");
var _util = require("@glint/core/lib/language-server/util");
var _glintLanguageServer = _interopRequireDefault(require("@glint/core/lib/language-server/glint-language-server"));
function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function debounce(threshold, f) {
    let pending;
    return ()=>{
        if (pending) {
            clearTimeout(pending);
        }
        setTimeout(f, threshold);
    };
}
function buildHelpers({ languageServer , documents , connection  }) {
    return {
        scheduleDiagnostics: debounce(250, ()=>{
            for (let { uri  } of documents.all()){
                let diagnostics = [];
                try {
                    diagnostics = languageServer.getDiagnostics(uri);
                } catch (e) {
                // EOL
                }
                const filteredDiagnostics = diagnostics.filter(({ message  })=>{
                    // https://github.com/typed-ember/glint/issues/222
                    if (message.includes('is declared but its value is never read')) {
                        return false;
                    }
                    if (message.includes("Type 'GlimmerComponent") && message.includes("is not assignable to type 'TemplateComponent")) {
                        return false;
                    }
                    if (message.includes("Type 'TemplateComponent") && message.includes("is not assignable to type 'GlimmerComponent")) {
                        return false;
                    }
                    if (message.includes('No overload matches this call.')) {
                        return false;
                    }
                    return true;
                });
                if (filteredDiagnostics.length) {
                    connection.sendDiagnostics({
                        uri,
                        diagnostics: filteredDiagnostics
                    });
                }
            }
        }),
        captureErrors (callback) {
            try {
                return callback();
            } catch (error) {
                var _stack;
                connection.console.error((_stack = error.stack) !== null && _stack !== void 0 ? _stack : error);
            }
        }
    };
}
module.exports = class ElsAddonGlint {
    onInit(server, project) {
        this.server = server;
        this.project = project;
        let destroy = this.bindLanguageServer();
        return ()=>{
            destroy();
        };
    }
    bindLanguageServer() {
        let connection = this.server.connection;
        let documents = this.server.documents;
        const ts = (0, _loadTypescript).loadTypeScript();
        const glintConfig = (0, _config).findConfig(this.project.root);
        const tsconfigPath = ts.findConfigFile(this.project.root, ts.sys.fileExists);
        const { fileNames , options  } = (0, _util).parseConfigFile(ts, tsconfigPath);
        const tsFileNames = fileNames.filter((fileName)=>/\.ts$/.test(fileName)
        );
        const baseProjectRoots = new Set(tsFileNames);
        const getRootFileNames = ()=>{
            return tsFileNames.concat(documents.all().map((doc)=>(0, _util).uriToFilePath(doc.uri)
            ).filter((path)=>path.endsWith(".ts") && !baseProjectRoots.has(path)
            ));
        };
        const languageServer = new _glintLanguageServer.default(ts, glintConfig, getRootFileNames, options);
        this.languageServer = languageServer;
        let { scheduleDiagnostics , captureErrors  } = buildHelpers({
            connection,
            documents,
            languageServer
        });
        // connection.onInitialize(() => ({ capabilities }));
        documents.onDidOpen(({ document  })=>{
            languageServer.openFile(document.uri, document.getText());
            scheduleDiagnostics();
        });
        documents.onDidClose(({ document  })=>{
            languageServer.closeFile(document.uri);
        });
        documents.onDidChangeContent(({ document  })=>{
            languageServer.updateFile(document.uri, document.getText());
            scheduleDiagnostics();
        });
        // connection.onPrepareRename(({ textDocument, position }) => {
        //   return captureErrors(() =>
        //     languageServer.prepareRename(textDocument.uri, position)
        //   );
        // });
        // connection.onRenameRequest(({ textDocument, position, newName }) => {
        //   return captureErrors(() =>
        //     languageServer.getEditsForRename(textDocument.uri, position, newName)
        //   );
        // });
        connection.onCompletionResolve((item)=>{
            var ref;
            return (ref = captureErrors(()=>languageServer.getCompletionDetails(item)
            )) !== null && ref !== void 0 ? ref : item;
        });
        connection.onWorkspaceSymbol(({ query  })=>{
            return captureErrors(()=>languageServer.findSymbols(query)
            );
        });
        connection.onDidChangeWatchedFiles(()=>{
        // TODO: use this to synchronize files that aren't open so we don't assume changes only
        // happen in the editor.
        });
        return ()=>{
            languageServer.dispose();
        };
    }
    async onHover(_, params) {
        const { textDocument , position  } = params;
        const hover = this.languageServer.getHover(textDocument.uri, position);
        if (hover) {
            return [
                hover
            ];
        }
        return params.results;
    }
    async onComplete(_, params) {
        const results = await this.languageServer.getCompletions(params.textDocument.uri, params.position);
        return [
            ...results || [],
            ...params.results
        ];
    }
    async onDefinition(_, params) {
        const results = await this.languageServer.getDefinition(params.textDocument.uri, params.position);
        return [
            ...results,
            ...params.results
        ];
    }
    async onReference(_, params) {
        const results = this.languageServer.getReferences(params.textDocument.uri, params.position);
        return [
            ...results,
            ...params.results
        ];
    }
};


//# sourceMappingURL=index.js.map