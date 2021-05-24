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
const projectRoot = "C:\\Users\\lifeart\\Documents\\repos\\dreamcatcher-web-app\\grdd";
const addonLocation = "C:\\Users\\lifeart\\Documents\\repos\\els-addon-glint";
const appName = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).name;
if (!fs.existsSync("./registry.json")) {
    const server = startServer();
    const connection = createConnection(server);
    connection.listen();
    initServer(connection, projectRoot).then(async ()=>{
        await setConfig();
        const p = await reloadProject();
        await new Promise((resolve)=>setTimeout(resolve, 2000)
        );
        const result = await getProjectRegistry();
        if (result !== null && !fs.existsSync("./registry.json")) {
            fs.writeFileSync("./registry.json", JSON.stringify(result, null, 2));
        }
    });
    function startServer() {
        const serverPath = require.resolve("@lifeart/ember-language-server/lib/start-server");
        return cp.fork(serverPath, [], {
            cwd: process.cwd()
        });
    }
    function createConnection(serverProcess) {
        return _node.createMessageConnection(new _node.IPCMessageReader(serverProcess), new _node.IPCMessageWriter(serverProcess));
    }
    async function initServer(connection1, root) {
        const params = {
            rootUri: _vscodeUri.URI.file(root).toString(),
            capabilities: {
            },
            initializationOptions: {
                isELSTesting: true
            }
        };
        return connection1.sendRequest(_node1.InitializeRequest.type, params);
    }
    async function setConfig() {
        return connection.sendRequest(_node1.ExecuteCommandRequest.type, {
            command: "els.setConfig",
            arguments: [
                {
                    local: {
                        addons: [
                            addonLocation
                        ]
                    }
                }, 
            ]
        });
    }
    async function getProjectRegistry() {
        return connection.sendRequest(_node1.ExecuteCommandRequest.type, {
            command: "els.getProjectRegistry",
            arguments: [
                projectRoot
            ]
        });
    }
    async function reloadProject() {
        const params = {
            command: "els.reloadProject",
            arguments: [
                projectRoot
            ]
        };
        return connection.sendRequest(_node1.ExecuteCommandRequest.type, params);
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
        this.addHelper(normalizedName, importName, paths);
        const cName = normalizeToAngleBracketComponent(normalizedName);
        this.stack.push([
            cName,
            importName, 
        ]);
    }
    addHelper(normalizedName, importName, paths) {
        const tsPath = paths.find((el)=>el.endsWith('.ts') && !el.includes('test')
        );
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
            this.prefix,
            ...this.stack.map(([name, imp])=>{
                return `"${name}": typeof ${imp};`;
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
const generator = new GlintInterfaceGenerator();
const data = JSON.parse(fs.readFileSync('./registry.json', 'utf8'));
Object.keys(data.component).forEach((name)=>{
    generator.addComponent(name, toClassName(name), data.component[name]);
});
Object.keys(data.helper).forEach((name)=>{
    generator.addHelper(name, toClassName(name), data.helper[name]);
});
console.log(generator.toString());

