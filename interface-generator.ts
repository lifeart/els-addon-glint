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
"C:\\Users\\lifeart\\Documents\\repos\\dreamcatcher-web-app\\grdd";
const addonLocation = "C:\\Users\\lifeart\\Documents\\repos\\els-addon-glint";


const appName = JSON.parse(fs.readFileSync(path.join(projectRoot,'package.json'), 'utf8')).name;


if (!fs.existsSync("./registry.json")) {
  const server = startServer();
  const connection: MessageConnection = createConnection(server);
  connection.listen();

  initServer(connection, projectRoot).then(async () => {
    await setConfig();
    const p = await reloadProject();
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const result = await getProjectRegistry();
    if (result !== null && !fs.existsSync("./registry.json")) {
      fs.writeFileSync("./registry.json", JSON.stringify(result, null, 2));
    }
    // console.log(result);
  });

  function startServer() {
    const serverPath = require.resolve(
      "@lifeart/ember-language-server/lib/start-server"
    );

    return cp.fork(serverPath, [], {
      cwd: process.cwd(),
    });
  }

  function createConnection(serverProcess) {
    return createMessageConnection(
      new IPCMessageReader(serverProcess),
      new IPCMessageWriter(serverProcess)
    );
  }

  async function initServer(connection: MessageConnection, root) {
    const params = {
      rootUri: URI.file(root).toString(),
      capabilities: {},
      initializationOptions: {
        isELSTesting: true,
      },
    };

    return connection.sendRequest(InitializeRequest.type as any, params);
  }

  async function setConfig() {
    return connection.sendRequest(
      ExecuteCommandRequest.type as unknown as string,
      {
        command: "els.setConfig",
        arguments: [
          {
            local: {
              addons: [addonLocation],
            },
          },
        ],
      }
    );
  }

  async function getProjectRegistry() {
    return connection.sendRequest(
      ExecuteCommandRequest.type as unknown as string,
      {
        command: "els.getProjectRegistry",
        arguments: [projectRoot],
      }
    );
  }

  async function reloadProject() {
    const params = {
      command: "els.reloadProject",
      arguments: [projectRoot],
    };

    return connection.sendRequest(ExecuteCommandRequest.type, params);
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

function toClassName(name) {
    return normalizeToAngleBracketComponent(name).split('::').join('');
}

class GlintInterfaceGenerator {
  prefix = "export default interface Registry {";
  postfix = "}";
  stack = [];
  imports = [];
  addComponent(normalizedName: string, importName: string, paths: string[]) {
    this.addHelper(normalizedName, importName, paths);
    const cName = normalizeToAngleBracketComponent(normalizedName);
    this.stack.push([
        cName,
      importName,
    ]);
  }
  addHelper(normalizedName: string, importName: string, paths: string[]) {
    const tsPath = paths.find(el=> el.endsWith('.ts') && !el.includes('test'));
    if (!tsPath) {
        return;
    }
    let importLocation = path.relative(projectRoot, tsPath).split(path.sep).join('/').replace('.d.ts', '').replace('.ts', '').replace('app/', appName + '/');
    this.imports.push(`import ${importName} from "${importLocation}";`)
    this.stack.push([normalizedName, importName]);
  }
  
  toString() {
    return [...this.imports, this.prefix, ...this.stack.map(([name, imp]) => {
        return `"${name}": typeof ${imp};`;
    }), this.postfix].join('\n');
  }
}


const generator = new GlintInterfaceGenerator();
const data = JSON.parse(fs.readFileSync('./registry.json', 'utf8'));

Object.keys(data.component).forEach((name) => {
    generator.addComponent(name, toClassName(name), data.component[name]);
});

Object.keys(data.helper).forEach((name) => {
    generator.addHelper(name, toClassName(name), data.helper[name]);
});


console.log(generator.toString());