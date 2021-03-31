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
                const diagnostics = languageServer.getDiagnostics(uri);
                connection.sendDiagnostics({
                    uri,
                    diagnostics
                });
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
module.exports = (function() {
    class ElsAddonQunitTestRunner {
        onInit(server, project) {
            this.server = server;
            this.project = project;
            let destroy = this.bindLanguageServer();
            return ()=>{
                destroy();
            };
        }
        bindLanguageServer() {
            const ts = _loadTypescript.loadTypeScript();
            const glintConfig = _config.findConfig(this.project.root);
            const tsconfigPath = ts.findConfigFile(this.project.root, ts.sys.fileExists);
            const { fileNames , options  } = _util.parseConfigFile(ts, tsconfigPath);
            const tsFileNames = fileNames.filter((fileName)=>/\.ts$/.test(fileName)
            );
            const baseProjectRoots = new Set(tsFileNames);
            const getRootFileNames = ()=>{
                return tsFileNames.concat(documents.all().map((doc)=>_util.uriToFilePath(doc.uri)
                ).filter((path)=>path.endsWith(".ts") && !baseProjectRoots.has(path)
                ));
            };
            const languageServer = new _glintLanguageServer.default(ts, glintConfig, getRootFileNames, options);
            this.languageServer = languageServer;
            let connection = this.server.connection;
            let documents = this.server.documents;
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
            connection.onPrepareRename(({ textDocument , position  })=>{
                return captureErrors(()=>languageServer.prepareRename(textDocument.uri, position)
                );
            });
            connection.onRenameRequest(({ textDocument , position , newName  })=>{
                return captureErrors(()=>languageServer.getEditsForRename(textDocument.uri, position, newName)
                );
            });
            connection.onCompletionResolve((item)=>{
                var ref;
                return (ref = captureErrors(()=>languageServer.getCompletionDetails(item)
                )) !== null && ref !== void 0 ? ref : item;
            });
            connection.onHover(({ textDocument , position  })=>{
                return captureErrors(()=>languageServer.getHover(textDocument.uri, position)
                );
            });
            connection.onReferences(({ textDocument , position  })=>{
                return captureErrors(()=>languageServer.getReferences(textDocument.uri, position)
                );
            });
            connection.onWorkspaceSymbol(({ query  })=>{
                return captureErrors(()=>languageServer.findSymbols(query)
                );
            });
            connection.onDidChangeWatchedFiles(()=>{
            });
            return ()=>{
                languageServer.dispose();
            };
        }
        async onComplete(_, params) {
            return this.languageServer.getCompletions(params.textDocument.uri, params.position);
        }
        async onDefinition(_, params) {
            return this.languageServer.getDefinition(params.textDocument.uri, params.position);
        }
        async onReference(root, params) {
            return this.languageServer.getReferences(params.textDocument.uri, params.position);
        }
    }
    return ElsAddonQunitTestRunner;
})();

