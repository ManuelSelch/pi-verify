type TestInput = { name: string; status: string; file?: string };
export type TestNode = { name: string; path: string; failed: boolean; children?: TestNode[]; tests?: number[]; names?: string[] };

export function buildTestTree(tests: TestInput[]): TestNode[] {
  const root: TestNode[] = [];
  tests.forEach((test, index) => {
    const segments = test.file?.replace(/\\/g, '/').split('/').filter(Boolean) ?? [];
    if (!segments.length) segments.push('Unknown location');
    let nodes = root;
    let current = test.file?.startsWith('/') ? '/' : '';
    segments.forEach((segment, position) => {
      current = current === '/' ? `/${segment}` : current ? `${current}/${segment}` : segment;
      const file = position === segments.length - 1;
      let node = nodes.find(item => item.path === current && Boolean(item.tests) === file);
      if (!node) {
        node = { name: file && test.file ? segment.replace(/\.test\.[^.]+$/i, '') : segment, path: current, failed: false, ...(file ? { tests: [], names: [] } : { children: [] }) };
        nodes.push(node);
      }
      if (test.status === 'failed') node.failed = true;
      if (node.tests) { node.tests.push(index); node.names!.push(test.name); }
      if (node.children) nodes = node.children;
    });
  });
  const sort = (nodes: TestNode[]) => {
    nodes.sort((a, b) => Number(!!b.children) - Number(!!a.children) || a.name.localeCompare(b.name));
    nodes.forEach(node => { if (node.children) sort(node.children); });
  };
  sort(root);
  const compact = (nodes: TestNode[]): TestNode[] => nodes.map(node => {
    if (!node.children) return node;
    let current = node;
    let name = node.name;
    while (current.children?.length === 1 && current.children[0].children) {
      current = current.children[0];
      name += `/${current.name}`;
    }
    return { ...current, name, children: compact(current.children!) };
  });
  return compact(root);
}

export function filterTestTree(nodes: TestNode[], query: string): TestNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return nodes;
  return nodes.flatMap(node => {
    if (node.path.toLowerCase().includes(needle)) return [node];
    if (node.children) {
      const children = filterTestTree(node.children, needle);
      return children.length ? [{ ...node, children }] : [];
    }
    const tests = node.tests!.filter((_, index) => node.names![index].toLowerCase().includes(needle));
    return tests.length ? [{ ...node, tests }] : [];
  });
}
