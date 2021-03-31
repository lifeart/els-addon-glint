"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.bindLanguageServer = bindLanguageServer;
exports.capabilities = void 0;
var _vscodeLanguageserver = require("vscode-languageserver");
var _scheduling = require("../common/scheduling");
const capabilities = {
    textDocumentSync: _vscodeLanguageserver.TextDocumentSyncKind.Full,
    completionProvider: {
        resolveProvider: true
    },
    referencesProvider: true,
    hoverProvider: true,
    definitionProvider: true,
    workspaceSymbolProvider: true,
    renameProvider: {
        prepareProvider: true
    }
};
exports.capabilities = capabilities;
function bindLanguageServer(args) {
    let { connection , languageServer , documents  } = args;
    let { scheduleDiagnostics , captureErrors  } = buildHelpers(args);
    connection.onInitialize(()=>({
            capabilities
        })
    );
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
    connection.onCompletion(({ textDocument , position  })=>{
        return captureErrors(()=>languageServer.getCompletions(textDocument.uri, position)
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
    connection.onDefinition(({ textDocument , position  })=>{
        return captureErrors(()=>languageServer.getDefinition(textDocument.uri, position)
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
}
function buildHelpers({ languageServer , documents , connection  }) {
    return {
        scheduleDiagnostics: _scheduling.debounce(250, ()=>{
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

