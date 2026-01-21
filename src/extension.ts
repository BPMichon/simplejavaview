import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
  const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!rootPath) return;

  const treeProvider = new MyTreeProvider(rootPath);
  vscode.window.registerTreeDataProvider("JavaSrcView", treeProvider);

  vscode.commands.registerCommand('simplejavaview.refresh', () => treeProvider.refresh());

  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(rootPath, 'src/main/**'));
  watcher.onDidChange(() => treeProvider.refresh());
  watcher.onDidCreate(() => treeProvider.refresh());
  watcher.onDidDelete(() => treeProvider.refresh());
  context.subscriptions.push(watcher);
}

class MyTreeProvider implements vscode.TreeDataProvider<FileNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<FileNode | undefined | void> = new vscode.EventEmitter<FileNode | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<FileNode | undefined | void> = this._onDidChangeTreeData.event;

  constructor(private rootPath: string) { }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(node: FileNode) {
    return node;
  }

  getChildren(node?: FileNode): FileNode[] {
    const items: { name: string; full: string; isDir: boolean }[] = [];

    if (!node) {
      // Root level: Aggregate src/main/java and src/main/resources
      const javaDir = path.join(this.rootPath, 'src/main/java');
      const resourcesDir = path.join(this.rootPath, 'src/main/resources');

      [javaDir, resourcesDir].forEach(dir => {
        if (fs.existsSync(dir)) {
          fs.readdirSync(dir).forEach(name => {
            const full = path.join(dir, name);
            const isDir = fs.statSync(full).isDirectory();
            items.push({ name, full, isDir });
          });
        }
      });
    } else {
      const dir = node.fullPath;
      if (fs.existsSync(dir)) {
        fs.readdirSync(dir).forEach(name => {
          const full = path.join(dir, name);
          const isDir = fs.statSync(full).isDirectory();
          items.push({ name, full, isDir });
        });
      }
    }

    if (items.length === 0) return [];

    return items.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    }).map(item => {
      if (!item.isDir) {
        return new FileNode(item.name, item.full, false);
      }

      // Proactively compact single-child directories
      let currentPath = item.full;
      let currentLabel = item.name;

      while (true) {
        if (!fs.existsSync(currentPath)) break;
        const subItems = fs.readdirSync(currentPath);
        if (subItems.length === 1) {
          const subItemName = subItems[0];
          const subItemPath = path.join(currentPath, subItemName);
          if (fs.statSync(subItemPath).isDirectory()) {
            currentPath = subItemPath;
            currentLabel = `${currentLabel}.${subItemName}`;
            continue;
          }
        }
        break;
      }

      return new FileNode(currentLabel, currentPath, true);
    });
  }
}

class FileNode extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly fullPath: string,
    public readonly isDir: boolean
  ) {
    super(label, isDir ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    this.resourceUri = vscode.Uri.file(fullPath);
    this.command = !isDir ? {
      command: 'vscode.open',
      title: 'Open File',
      arguments: [this.resourceUri]
    } : undefined;
  }
}
export function deactivate() { }