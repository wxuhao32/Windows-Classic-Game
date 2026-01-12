// A* Pathfinding Algorithm

import { TileType, MAP_WIDTH, MAP_HEIGHT } from './types';

interface Node {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: Node | null;
}

export function findPath(
  map: TileType[][],
  startX: number,
  startY: number,
  endX: number,
  endY: number
): { x: number; y: number }[] | null {
  const sx = Math.floor(startX);
  const sy = Math.floor(startY);
  const ex = Math.floor(endX);
  const ey = Math.floor(endY);

  if (sx < 0 || sx >= MAP_WIDTH || sy < 0 || sy >= MAP_HEIGHT) return null;
  if (ex < 0 || ex >= MAP_WIDTH || ey < 0 || ey >= MAP_HEIGHT) return null;

  const openList: Node[] = [];
  const closedSet = new Set<string>();

  const heuristic = (x: number, y: number) => Math.abs(x - ex) + Math.abs(y - ey);

  const startNode: Node = { x: sx, y: sy, g: 0, h: heuristic(sx, sy), f: heuristic(sx, sy), parent: null };
  openList.push(startNode);

  const directions = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
  ];

  const isWalkable = (x: number, y: number): boolean => {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return false;
    const tile = map[y]?.[x];
    return tile === TileType.EMPTY || tile === TileType.FOREST || tile === TileType.ICE;
  };

  let iterations = 0;
  const maxIterations = 500;

  while (openList.length > 0 && iterations < maxIterations) {
    iterations++;
    openList.sort((a, b) => a.f - b.f);
    const current = openList.shift()!;
    const key = `${current.x},${current.y}`;

    if (current.x === ex && current.y === ey) {
      const path: { x: number; y: number }[] = [];
      let node: Node | null = current;
      while (node) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return path;
    }

    closedSet.add(key);

    for (const { dx, dy } of directions) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const nkey = `${nx},${ny}`;

      if (closedSet.has(nkey) || !isWalkable(nx, ny)) continue;

      const g = current.g + 1;
      const h = heuristic(nx, ny);
      const existing = openList.find((n) => n.x === nx && n.y === ny);

      if (!existing) {
        openList.push({ x: nx, y: ny, g, h, f: g + h, parent: current });
      } else if (g < existing.g) {
        existing.g = g;
        existing.f = g + h;
        existing.parent = current;
      }
    }
  }

  return null;
}
