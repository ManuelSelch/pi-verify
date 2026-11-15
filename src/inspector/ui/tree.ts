type CoverageInput = { path: string; lines: { line: number; hits: number }[] };
export type CoverageNode = { name: string; path: string; hit: number; found: number; index?: number; children?: CoverageNode[] };

export function buildCoverageTree(files: CoverageInput[]): CoverageNode[] {
  const root: CoverageNode[] = [];
  files.forEach((file, index) => {
    const segments = file.path.replace(/\\/g, '/').split('/').filter(Boolean);
    let nodes = root;
    let path = file.path.startsWith('/') ? '/' : '';
    const found = file.lines.length;
    const hit = file.lines.filter(line => line.hits > 0).length;
    segments.forEach((name, i) => {
      path = path === '/' ? `/${name}` : path ? `${path}/${name}` : name;
      const folder = i < segments.length - 1;
      let node = folder ? nodes.find(item => item.name === name && item.children) : undefined;
      if (!node) {
        node = { name, path, hit: 0, found: 0, ...(folder ? { children: [] } : { index }) };
        nodes.push(node);
      }
      node.hit += hit;
      node.found += found;
      if (node.children) nodes = node.children;
    });
  });
  const sort = (nodes: CoverageNode[]) => {
    nodes.sort((a, b) => Number(!!b.children) - Number(!!a.children) || a.name.localeCompare(b.name));
    nodes.forEach(node => { if (node.children) sort(node.children); });
  };
  sort(root);
  return root;
}

export function filterCoverageTree(nodes: CoverageNode[], query: string): CoverageNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return nodes;
  return nodes.flatMap(node => {
    if (node.path.toLowerCase().includes(needle)) return [node];
    const children = node.children && filterCoverageTree(node.children, needle);
    return children?.length ? [{ ...node, children }] : [];
  });
}
