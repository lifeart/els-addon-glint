// export default interface Registry {
//     'Grouping::MyComponent': typeof MyComponent;
//     'grouping/my-component': typeof MyComponent;
// }

import * as cp from "child_process";
import * as fs from "fs";
import { URI } from "vscode-uri";
import * as path from 'path';

import {
  createMessageConnection,
  IPCMessageReader,
  IPCMessageWriter,
} from "vscode-jsonrpc/node";
import {
  ExecuteCommandRequest,
  InitializeRequest,
} from "vscode-languageserver-protocol/node";

import type { MessageConnection } from "vscode-jsonrpc/node";

const projectRoot =
  "/Users/aleksandr_kanunnikov/Documents/repos/smassetman_spa/smassetman";

function getProjectName(rawFsPath: string) {
  const fsPath = rawFsPath.split('/').join(path.sep);
  if (fs.existsSync(path.join(fsPath, 'package.json'))) {
    return JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).name;
  } else {
    let parts = fsPath.split(path.sep);
    parts.pop();
    if (!parts.length) {
      return 'unknown';
    }
    return getProjectName(parts.join(path.sep));
  }
}

const appName = getProjectName(projectRoot);


class DataLoader {
  server!: cp.ChildProcess;
  connection!: MessageConnection;
  root!: string;
  constructor(root: string) {
    this.root = root;
    this.server = DataLoader.startServer()
    this.connection = DataLoader.createConnection(this.server);
    this.connection.listen();
  }
  static createConnection(serverProcess: cp.ChildProcess) {
    return createMessageConnection(
      new IPCMessageReader(serverProcess),
      new IPCMessageWriter(serverProcess)
    );
  }
  static startServer() {
    const serverPath = require.resolve(
      "@lifeart/ember-language-server/lib/start-server"
    );

    return cp.fork(serverPath, [], {
      cwd: process.cwd(),
    });
  }
  destroy() {
    this.connection.dispose();
    this.server.disconnect();
  }
  async initServer() {
    const params = {
      rootUri: URI.file(this.root).toString(),
      capabilities: {},
      initializationOptions: {
        isELSTesting: true,
      },
    };

    return this.connection.sendRequest(InitializeRequest.type as any, params);
  }


  async loadRegistry() {
    await this.initServer();
    await this.reloadProject();
    await new Promise((resolve) => setTimeout(resolve, 10000));
    const result: any = await this.getProjectRegistry();

    return result.registry;
  }

  async reloadProject() {
    const params = {
      command: "els.reloadProject",
      arguments: [this.root],
    };

    return this.connection.sendRequest(ExecuteCommandRequest.type, params);
  }

  async getProjectRegistry() {
    return this.connection.sendRequest(
      ExecuteCommandRequest.type as unknown as string,
      {
        command: "els.getProjectRegistry",
        arguments: [this.root],
      }
    );
  }
}


function normalizeToAngleBracketComponent(name: string) {
  const SIMPLE_DASHERIZE_REGEXP = /[a-z]|\/|-/g;
  const ALPHA = /[A-Za-z0-9]/;

  if (name.includes(".")) {
    return name;
  }

  return name.replace(SIMPLE_DASHERIZE_REGEXP, (char, index) => {
    if (char === "/") {
      return "::";
    }

    if (index === 0 || !ALPHA.test(name[index - 1])) {
      return char.toUpperCase();
    }

    // Remove all occurrences of '-'s from the name that aren't starting with `-`
    return char === "-" ? "" : char.toLowerCase();
  });
}

function toClassName(name: string) {
  return normalizeToAngleBracketComponent(name).split('::').join('').split('-').join('');
}

class GlintInterfaceGenerator {
  prefix = "export default interface Registry {";
  postfix = "}";
  stack = [];
  imports = [];
  addComponent(normalizedName: string, importName: string, paths: string[]) {
    if (!this.correctFile(paths)) {
      return;
    }
    this.addHelper(normalizedName, importName, paths);
    const cName = normalizeToAngleBracketComponent(normalizedName);
    this.stack.push([
      cName,
      importName,
    ]);
  }
  correctFile(paths: string[]) {
    let ts = paths.find(el => el.endsWith('.ts') && !el.includes('test'));
    if (ts) {
      return ts;
    }
    let js = paths.find(el => el.endsWith('.js') && !el.includes('test'));
    return js;
  }
  addHelper(normalizedName: string, importName: string, paths: string[]) {
    const tsPath = this.correctFile(paths);
    if (!tsPath) {
      return;
    }
    let importLocation = tsPath.replace(projectRoot, '').split(path.sep).join('/').replace('.d.ts', '').replace('.ts', '').replace('.js', '');
    if (importLocation.startsWith('/')) {
      importLocation = importLocation.replace('/', '');
    }
    if (importLocation.includes('node_modules')) {
      importLocation = importLocation.split('node_modules/').pop().replace('/app/', '');
    } else {
      importLocation = importLocation.replace('app/', appName + '/');
    }

    this.imports.push(`import ${importName} from "${importLocation}";`)
    this.stack.push([normalizedName, importName]);
  }

  toString() {
    return [...this.imports, , this.prefix, ...this.stack.map(([name, imp]) => {
      return `  "${name}": typeof ${imp};`;
    }), this.postfix].join('\n');
  }
}


const loader = new DataLoader(projectRoot);
const generator = new GlintInterfaceGenerator();


loader.loadRegistry().then((data) => {
  fs.writeFileSync('registry.json', JSON.stringify(data, null, 2), 'utf8');
  Object.keys(data.component).forEach((name) => {
    generator.addComponent(name, toClassName(name), data.component[name]);
  });

  Object.keys(data.helper).forEach((name) => {
    generator.addHelper(name, toClassName(name), data.helper[name]);
  });

  loader.destroy();

  console.log(generator.toString());
  process.exit(0);
})
