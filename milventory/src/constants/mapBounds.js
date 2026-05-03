/** Room bounds in world/map coordinates — must match src/api/helpers/map_bounds.py */
export const MAP_ROOM = {
  x: 80,
  y: 80,
  width: 3600,
  height: 3840
};

export function clampPointToRoom(x, y) {
  const maxX = MAP_ROOM.x + MAP_ROOM.width;
  const maxY = MAP_ROOM.y + MAP_ROOM.height;
  return {
    x: Math.round(Math.max(MAP_ROOM.x, Math.min(maxX, x))),
    y: Math.round(Math.max(MAP_ROOM.y, Math.min(maxY, y)))
  };
}

export function pointInRoom(x, y) {
  const p = clampPointToRoom(x, y);
  return p.x === Math.round(x) && p.y === Math.round(y);
}
