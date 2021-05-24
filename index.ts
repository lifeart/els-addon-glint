import {
  Project,
  Server,
  AddonAPI,
  CompletionFunctionParams,
  DefinitionFunctionParams,
  ReferenceFunctionParams,
} from "@lifeart/ember-language-server";
import { loadTypeScript } from "@glint/core/lib/common/load-typescript";
import { Connection, TextDocuments } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { findConfig } from "@glint/config";
import {
  parseConfigFile,
  uriToFilePath,
} from "@glint/core/lib/language-server/util";
import GlintLanguageServer from "@glint/core/lib/language-server/glint-language-server";

type BindingHelpers = {
  scheduleDiagnostics: () => void;
  captureErrors: <T>(callback: () => T) => T | undefined;
};

function debounce(threshold: number, f: () => void): () => void {
  let pending: NodeJS.Timeout | undefined;
  return () => {
    if (pending) {
      clearTimeout(pending);
    }

    setTimeout(f, threshold);
  };
}

export type BindingArgs = {
  languageServer: GlintLanguageServer;
  documents: TextDocuments<TextDocument>;
  connection: Connection;
};

function buildHelpers({
  languageServer,
  documents,
  connection,
}: BindingArgs): BindingHelpers {
  return {
    scheduleDiagnostics: debounce(250, () => {
      for (let { uri } of documents.all()) {
        const diagnostics = languageServer.getDiagnostics(uri);
        connection.sendDiagnostics({ uri, diagnostics });
      }
    }),

    captureErrors(callback) {
      try {
        return callback();
      } catch (error) {
        connection.console.error(error.stack ?? error);
      }
    },
  };
}
module.exports = class ElsAddonQunitTestRunner implements AddonAPI {
  server!: Server;
  project!: Project;
  languageServer!: GlintLanguageServer;
  onInit(server: Server, project: Project) {

    project.executors["els.getProjectRegistry"] = async (server, __, [cmd]) => {
      return server.getRegistry(project.root);
    }

    this.server = server;
    this.project = project;
    let destroy = this.bindLanguageServer();

    return () => {
      destroy();
      project.executors["els.getProjectRegistry"] = undefined;
    };
  }
  bindLanguageServer() {
    let connection = this.server.connection;
    let documents = this.server.documents;
    const ts = loadTypeScript();
    const glintConfig = findConfig(this.project.root);

    const tsconfigPath = ts.findConfigFile(
      this.project.root,
      ts.sys.fileExists
    );
    const { fileNames, options } = parseConfigFile(ts, tsconfigPath);

    const tsFileNames = fileNames.filter((fileName) => /\.ts$/.test(fileName));
    const baseProjectRoots = new Set(tsFileNames);
    const getRootFileNames = (): Array<string> => {
      return tsFileNames.concat(
        documents
          .all()
          .map((doc) => uriToFilePath(doc.uri))
          .filter((path) => path.endsWith(".ts") && !baseProjectRoots.has(path))
      );
    };

    const languageServer = new GlintLanguageServer(
      ts,
      glintConfig,
      getRootFileNames,
      options
    );

    this.languageServer = languageServer;


    let { scheduleDiagnostics, captureErrors } = buildHelpers({
      connection,
      documents,
      languageServer,
    });

    // connection.onInitialize(() => ({ capabilities }));

    documents.onDidOpen(({ document }) => {
      languageServer.openFile(document.uri, document.getText());
      scheduleDiagnostics();
    });

    documents.onDidClose(({ document }) => {
      languageServer.closeFile(document.uri);
    });

    documents.onDidChangeContent(({ document }) => {
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

    connection.onCompletionResolve((item) => {
      return (
        captureErrors(() => languageServer.getCompletionDetails(item)) ?? item
      );
    });

    connection.onHover(({ textDocument, position }) => {
      return captureErrors(() =>
        languageServer.getHover(textDocument.uri, position)
      );
    });

    connection.onWorkspaceSymbol(({ query }) => {
      return captureErrors(() => languageServer.findSymbols(query));
    });

    connection.onDidChangeWatchedFiles(() => {
      // TODO: use this to synchronize files that aren't open so we don't assume changes only
      // happen in the editor.
    });

    return () => {
      languageServer.dispose();
    };
  }
  async onComplete(_: string, params: CompletionFunctionParams) {
    const results = await this.languageServer.getCompletions(
      params.textDocument.uri,
      params.position
    );
    return [...results, ...params.results];
  }
  async onDefinition(_: string, params: DefinitionFunctionParams) {
    const results = await this.languageServer.getDefinition(
      params.textDocument.uri,
      params.position
    );
    return [...results, ...params.results];
  }
  async onReference(_: string, params: ReferenceFunctionParams) {
    const results = this.languageServer.getReferences(
      params.textDocument.uri,
      params.position
    );
    return [...results, ...params.results];
  }
};
