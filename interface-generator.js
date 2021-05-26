"use strict";
var cp = _interopRequireWildcard(require("child_process"));
var fs = _interopRequireWildcard(require("fs"));
var _vscodeUri = require("vscode-uri");
var path = _interopRequireWildcard(require("path"));
var _node = require("vscode-jsonrpc/node");
var _node1 = require("vscode-languageserver-protocol/node");
function _interopRequireWildcard(obj) {
    if (obj && obj.__esModule) {
        return obj;
    } else {
        var newObj = {
        };
        if (obj != null) {
            for(var key in obj){
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {
                    };
                    if (desc.get || desc.set) {
                        Object.defineProperty(newObj, key, desc);
                    } else {
                        newObj[key] = obj[key];
                    }
                }
            }
        }
        newObj.default = obj;
        return newObj;
    }
}
const projectRoot = "/Users/aleksandr_kanunnikov/Documents/repos/smassetman_spa/smassetman";
const appName = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).name;
class DataLoader {
    static createConnection(serverProcess) {
        return _node.createMessageConnection(new _node.IPCMessageReader(serverProcess), new _node.IPCMessageWriter(serverProcess));
    }
    static startServer() {
        const serverPath = require.resolve("@lifeart/ember-language-server/lib/start-server");
        return cp.fork(serverPath, [], {
            cwd: process.cwd()
        });
    }
    destroy() {
        this.connection.dispose();
        this.server.disconnect();
    }
    async initServer() {
        const params = {
            rootUri: _vscodeUri.URI.file(this.root).toString(),
            capabilities: {
            },
            initializationOptions: {
                isELSTesting: true
            }
        };
        return this.connection.sendRequest(_node1.InitializeRequest.type, params);
    }
    async loadRegistry() {
        await this.initServer();
        await this.reloadProject();
        await new Promise((resolve)=>setTimeout(resolve, 2000)
        );
        const result = await this.getProjectRegistry();
        return result.registry;
    }
    async reloadProject() {
        const params = {
            command: "els.reloadProject",
            arguments: [
                this.root
            ]
        };
        return this.connection.sendRequest(_node1.ExecuteCommandRequest.type, params);
    }
    async getProjectRegistry() {
        return this.connection.sendRequest(_node1.ExecuteCommandRequest.type, {
            command: "els.getProjectRegistry",
            arguments: [
                this.root
            ]
        });
    }
    constructor(root){
        this.root = root;
        this.server = DataLoader.startServer();
        this.connection = DataLoader.createConnection(this.server);
        this.connection.listen();
    }
}
function normalizeToAngleBracketComponent(name) {
    const SIMPLE_DASHERIZE_REGEXP = /[a-z]|\/|-/g;
    const ALPHA = /[A-Za-z0-9]/;
    if (name.includes(".")) {
        return name;
    }
    return name.replace(SIMPLE_DASHERIZE_REGEXP, (char, index)=>{
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
    addComponent(normalizedName, importName, paths) {
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
    correctFile(paths) {
        return paths.find((el)=>el.endsWith('.ts') && !el.includes('test')
        );
    }
    addHelper(normalizedName, importName, paths) {
        const tsPath = this.correctFile(paths);
        if (!tsPath) {
            return;
        }
        let importLocation = path.relative(projectRoot, tsPath).split(path.sep).join('/').replace('.d.ts', '').replace('.ts', '').replace('app/', appName + '/');
        this.imports.push(`import ${importName} from "${importLocation}";`);
        this.stack.push([
            normalizedName,
            importName
        ]);
    }
    toString() {
        return [
            ...this.imports,
            ,
            this.prefix,
            ...this.stack.map(([name, imp])=>{
                return `  "${name}": typeof ${imp};`;
            }),
            this.postfix
        ].join('\n');
    }
    constructor(){
        this.prefix = "export default interface Registry {";
        this.postfix = "}";
        this.stack = [];
        this.imports = [];
    }
}
const loader = new DataLoader(projectRoot);
const generator = new GlintInterfaceGenerator();
loader.loadRegistry().then((data)=>{
    Object.keys(data.component).forEach((name)=>{
        generator.addComponent(name, toClassName(name), data.component[name]);
    });
    Object.keys(data.helper).forEach((name)=>{
        generator.addHelper(name, toClassName(name), data.helper[name]);
    });
    loader.destroy();
    console.log(generator.toString());
    process.exit(0);
});

