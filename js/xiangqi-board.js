import { XiangqiGame, Piece, MoveNode } from './xiangqi-game.js';
import StorageManager from './storage.js';
import FileHandleStore from './file-handle-store.js';

const CANVAS_W = 800;
const CANVAS_H = 900;
const CELL = 72.0;
const BOARD_OFFSET = { x: 112, y: 110 };
const SLOT_SIZE = 44.0;
const SLOT_GAP = 8.0;
const PANEL_RECT = { x: 150, y: 110, w: 500, h: 560 };
const PANEL_ROW_H = 24.0;
const PANEL_HEADER_H = 40.0;
const LIB_RECT = { x: 100, y: 110, w: 600, h: 600 };
const LIB_HEADER_H = 50.0;
const LIB_ROW_H = 56.0;

const COLORS = {
	frame: '#593d23',
	board: '#e0c48a',
	line: '#382112',
	pieceBg: '#f5e8c7',
	redChar: '#bf1f1a',
	blackChar: '#1a1a21',
	sel: '#f2bf26',
	hint: 'rgba(51,153,230,0.55)',
	cap: '#e64d33',
	text: '#f5ebd7',
	lastDot: '#40b859',
	panelBg: 'rgba(30,23,15,0.94)',
	panelBrd: '#bf9e6b',
	panCur: 'rgba(255,217,77,0.90)',
	panPath: 'rgba(242,217,140,0.30)',
	panText: '#c7b8a3',
	panelHL: 'rgba(255,235,130,0.65)',
	setupPaletteSlot: '#80613d',
};

const TYPE_LIST = ['K', 'A', 'E', 'H', 'R', 'C', 'S'];

const PIECE_KEY_MAP = {
	red: { K: 'shuai', A: 'shi', E: 'xiang', H: 'ma', R: 'che', C: 'pao', S: 'bing' },
	black: { K: 'jiang', A: 'shi', E: 'xiang', H: 'ma', R: 'ju', C: 'pao', S: 'zu' },
};

const CN_PIECE_CHAR = {
	red: { K: '帅', A: '仕', E: '相', H: '马', R: '车', C: '炮', S: '兵' },
	black: { K: '将', A: '士', E: '象', H: '马', R: '车', C: '炮', S: '卒' },
};

const RED_FILES = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

let canvas, ctx;
let game;
let pieces = {};
let selected = null;
let legalTargets = [];
let lastMove = null;
let panelOpen = false;
let panelScroll = 0;
let panelRowsCache = [];
let libOpen = false;
let libScroll = 0;
let libList = [];
let mode = 'play';
let setupPalette = null;
let hover = null;
let setupRedFirst = true;
let gameEventsConnected = false;
let errorMsg = '';
let errorTime = 0;
let hintMsg = '';
let hintTime = 0;
let gameOverMsg = '';
let currentLibraryId = null;       // 当前对局关联的棋谱库条目ID（有值时保存走更新，不新建）
let currentLibraryFilename = null; // 对应库条目的文件名（可选记录，便于更新展示）
// 磁盘文件绑定：当前 currentLibraryId 对应的 FileSystemFileHandle 内存态。
// 「同一盘棋对应同一个磁盘 .pgn 文件，更新时覆盖同文件不再下载副本」的核心锚点。
let currentBoundFile = null;       // { libraryId, handle, pathHint, updatedAt } | null

function cell2px(x, y) {
	return { x: BOARD_OFFSET.x + x * CELL, y: BOARD_OFFSET.y + y * CELL };
}

function px2cell(px, py) {
	const x = Math.round((px - BOARD_OFFSET.x) / CELL);
	const y = Math.round((py - BOARD_OFFSET.y) / CELL);
	if (x < 0 || x > 8 || y < 0 || y > 9) return null;
	const c = cell2px(x, y);
	const dist = Math.hypot(px - c.x, py - c.y);
	if (dist > CELL * 0.45) return null;
	return { x, y };
}

function deepcopy(obj) {
	return JSON.parse(JSON.stringify(obj));
}

function clonePiece(p) {
	if (!p) return null;
	return new Piece(p.side, p.type);
}

function pieceKey(piece) {
	const side = piece.side;
	const type = PIECE_KEY_MAP[side][piece.type];
	return `${side}-${type}`;
}

function requestRender() {
	requestAnimationFrame(render);
}

function setError(msg) {
	errorMsg = msg;
	errorTime = 4000;
	requestRender();
}

function setHint(msg) {
	hintMsg = msg;
	hintTime = 3000;
	requestRender();
}

function loadPieceImages() {
	const sides = ['red', 'black'];
	for (const side of sides) {
		for (const type of TYPE_LIST) {
			const typeKey = PIECE_KEY_MAP[side][type];
			const key = `${side}-${typeKey}`;
			const img = new Image();
			img.onerror = () => { pieces[key] = null; };
			img.onload = () => { requestRender(); };
			img.src = `./assets/pieces/${key}.png`;
			pieces[key] = img;
		}
	}
}

function drawFrame() {
	ctx.fillStyle = COLORS.frame;
	ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

function drawBoardBase() {
	const x0 = BOARD_OFFSET.x - CELL * 0.5;
	const y0 = BOARD_OFFSET.y - CELL * 0.5;
	const w = CELL * 9;
	const h = CELL * 10;
	ctx.fillStyle = COLORS.board;
	ctx.fillRect(x0, y0, w, h);
}

function drawGrid() {
	ctx.strokeStyle = COLORS.line;
	ctx.lineWidth = 2.0;
	for (let x = 0; x < 9; x++) {
		const px = BOARD_OFFSET.x + x * CELL;
		if (x === 0 || x === 8) {
			ctx.beginPath();
			ctx.moveTo(px, BOARD_OFFSET.y);
			ctx.lineTo(px, BOARD_OFFSET.y + 9 * CELL);
			ctx.stroke();
		} else {
			ctx.beginPath();
			ctx.moveTo(px, BOARD_OFFSET.y);
			ctx.lineTo(px, BOARD_OFFSET.y + 4 * CELL);
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo(px, BOARD_OFFSET.y + 5 * CELL);
			ctx.lineTo(px, BOARD_OFFSET.y + 9 * CELL);
			ctx.stroke();
		}
	}
	for (let y = 0; y < 10; y++) {
		const py = BOARD_OFFSET.y + y * CELL;
		ctx.beginPath();
		ctx.moveTo(BOARD_OFFSET.x, py);
		ctx.lineTo(BOARD_OFFSET.x + 8 * CELL, py);
		ctx.stroke();
	}
	for (const cy of [0, 7]) {
		const p1 = cell2px(3, cy);
		const p2 = cell2px(5, cy + 2);
		ctx.beginPath();
		ctx.moveTo(p1.x, p1.y);
		ctx.lineTo(p2.x, p2.y);
		ctx.stroke();
		const p3 = cell2px(5, cy);
		const p4 = cell2px(3, cy + 2);
		ctx.beginPath();
		ctx.moveTo(p3.x, p3.y);
		ctx.lineTo(p4.x, p4.y);
		ctx.stroke();
	}
}

function drawCornerMarks(pos, inLen, outLen) {
	ctx.strokeStyle = COLORS.line;
	ctx.lineWidth = 2.0;
	const corners = [
		{ dx: 1, dy: 1 },
		{ dx: -1, dy: 1 },
		{ dx: -1, dy: -1 },
		{ dx: 1, dy: -1 },
	];
	for (const c of corners) {
		const vx = pos.x + c.dx * inLen;
		const vy = pos.y + c.dy * inLen;
		if (vx - CELL * 0.45 < BOARD_OFFSET.x - CELL * 0.48 && c.dx < 0) continue;
		if (vx + CELL * 0.45 > BOARD_OFFSET.x + 8 * CELL + CELL * 0.48 && c.dx > 0) continue;
		if (vy - CELL * 0.45 < BOARD_OFFSET.y - CELL * 0.48 && c.dy < 0) continue;
		if (vy + CELL * 0.45 > BOARD_OFFSET.y + 9 * CELL + CELL * 0.48 && c.dy > 0) continue;
		ctx.beginPath();
		ctx.moveTo(vx, vy);
		ctx.lineTo(vx + c.dx * outLen, vy);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(vx, vy);
		ctx.lineTo(vx, vy + c.dy * outLen);
		ctx.stroke();
	}
}

function drawAllCornerMarks() {
	for (const p of [{ x: 1, y: 2 }, { x: 7, y: 2 }, { x: 1, y: 7 }, { x: 7, y: 7 }]) {
		const pos = cell2px(p.x, p.y);
		drawCornerMarks(pos, 5.0, 7.0);
	}
	for (const y of [3, 6]) {
		for (const x of [0, 2, 4, 6, 8]) {
			const pos = cell2px(x, y);
			drawCornerMarks(pos, 4.0, 6.0);
		}
	}
}

function drawRiver() {
	const riverY = BOARD_OFFSET.y + 4.5 * CELL;
	const riverSpan = 8 * CELL;
	ctx.save();
	ctx.fillStyle = COLORS.line;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = '36px "LiSu", "华文隶书", "STLiti", "KaiTi", "Microsoft YaHei UI", sans-serif';
	ctx.fillText('楚河', BOARD_OFFSET.x + riverSpan / 4.0, riverY);
	ctx.fillText('汉界', BOARD_OFFSET.x + riverSpan * 3.0 / 4.0, riverY);
	ctx.restore();
}

function drawAnnotations() {
	ctx.save();
	ctx.fillStyle = COLORS.line;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = '14px "Microsoft YaHei UI", sans-serif';
	for (let x = 0; x < 9; x++) {
		const cx = BOARD_OFFSET.x + x * CELL;
		ctx.fillText(RED_FILES[8 - x], cx, 816);
		ctx.fillText(String(x + 1), cx, 62);
	}
	ctx.restore();
}

function drawLastMove() {
	if (!lastMove) return;
	for (const key of ['from', 'to']) {
		const pos = lastMove[key];
		if (!pos || pos.x < 0) continue;
		const c = cell2px(pos.x, pos.y);
		ctx.fillStyle = COLORS.lastDot;
		ctx.beginPath();
		ctx.arc(c.x, c.y, 6.0, 0, Math.PI * 2);
		ctx.fill();
	}
	if (game.current_node && !game.current_node.isRoot()) {
		const node = game.current_node;
		const depth = node.getDepth();
		if (depth > 0) {
			const c = cell2px(node.to.x, node.to.y);
			ctx.save();
			ctx.fillStyle = COLORS.text;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.font = '16px "Microsoft YaHei UI", sans-serif';
			ctx.fillText(String(depth), c.x + 24, c.y - 24);
			ctx.restore();
		}
	}
}

function drawPieceAt(x, y, piece, size) {
	const s = size || 72;
	const radius = s / 2 - 2;
	const c = cell2px(x, y);
	const key = pieceKey(piece);
	const img = pieces[key];
	if (img && img.complete && img.naturalWidth > 0) {
		ctx.drawImage(img, c.x - s / 2, c.y - s / 2, s, s);
	} else {
		ctx.save();
		ctx.fillStyle = COLORS.pieceBg;
		ctx.beginPath();
		ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = piece.side === 'red' ? COLORS.redChar : COLORS.blackChar;
		ctx.lineWidth = 2;
		ctx.stroke();
		const char = CN_PIECE_CHAR[piece.side][piece.type];
		ctx.fillStyle = piece.side === 'red' ? COLORS.redChar : COLORS.blackChar;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		const fontSize = Math.floor(s * 0.6);
		ctx.font = `bold ${fontSize}px "KaiTi", "STKaiti", "Microsoft YaHei UI", sans-serif`;
		ctx.fillText(char, c.x, c.y);
		ctx.restore();
	}
}

function drawPieceDirect(px, py, piece, size) {
	const s = size || 72;
	const radius = s / 2 - 2;
	const key = pieceKey(piece);
	const img = pieces[key];
	if (img && img.complete && img.naturalWidth > 0) {
		ctx.drawImage(img, px - s / 2, py - s / 2, s, s);
	} else {
		ctx.save();
		ctx.fillStyle = COLORS.pieceBg;
		ctx.beginPath();
		ctx.arc(px, py, radius, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = piece.side === 'red' ? COLORS.redChar : COLORS.blackChar;
		ctx.lineWidth = 2;
		ctx.stroke();
		const char = CN_PIECE_CHAR[piece.side][piece.type];
		ctx.fillStyle = piece.side === 'red' ? COLORS.redChar : COLORS.blackChar;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		const fontSize = Math.floor(s * 0.6);
		ctx.font = `bold ${fontSize}px "KaiTi", "STKaiti", "Microsoft YaHei UI", sans-serif`;
		ctx.fillText(char, px, py);
		ctx.restore();
	}
}

function drawPieces() {
	for (let y = 0; y < 10; y++) {
		for (let x = 0; x < 9; x++) {
			const p = game.board[y][x];
			if (p) drawPieceAt(x, y, p, 72);
		}
	}
}

function drawSelected() {
	if (!selected) return;
	const c = cell2px(selected.x, selected.y);
	const size = 76;
	ctx.save();
	ctx.strokeStyle = COLORS.sel;
	ctx.lineWidth = 4;
	ctx.beginPath();
	const r = 3;
	const x = c.x - size / 2;
	const y = c.y - size / 2;
	ctx.moveTo(x + r, y);
	ctx.lineTo(x + size - r, y);
	ctx.quadraticCurveTo(x + size, y, x + size, y + r);
	ctx.lineTo(x + size, y + size - r);
	ctx.quadraticCurveTo(x + size, y + size, x + size - r, y + size);
	ctx.lineTo(x + r, y + size);
	ctx.quadraticCurveTo(x, y + size, x, y + size - r);
	ctx.lineTo(x, y + r);
	ctx.quadraticCurveTo(x, y, x + r, y);
	ctx.stroke();
	ctx.restore();
	for (const mv of legalTargets) {
		const tc = cell2px(mv.to.x, mv.to.y);
		const target = game.board[mv.to.y][mv.to.x];
		if (target === null) {
			ctx.fillStyle = COLORS.hint;
			ctx.beginPath();
			ctx.arc(tc.x, tc.y, 8, 0, Math.PI * 2);
			ctx.fill();
		} else {
			ctx.save();
			ctx.strokeStyle = COLORS.cap;
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.arc(tc.x, tc.y, 30 + 6, 0, Math.PI * 2);
			ctx.stroke();
			ctx.restore();
		}
	}
}

function drawForkMarks() {
	if (!game.current_node) return;
	const children = game.current_node.getChildren();
	if (children.length <= 1) return;
	let sameFrom = true;
	const firstFrom = children[0].from;
	for (let i = 1; i < children.length; i++) {
		if (children[i].from.x !== firstFrom.x || children[i].from.y !== firstFrom.y) {
			sameFrom = false;
			break;
		}
	}
	if (!sameFrom) {
		ctx.save();
		ctx.strokeStyle = 'rgba(255,217,89,0.65)';
		ctx.lineWidth = 2;
		ctx.setLineDash([6, 6]);
		for (const child of children) {
			const fc = cell2px(child.from.x, child.from.y);
			const tc = cell2px(child.to.x, child.to.y);
			ctx.beginPath();
			ctx.moveTo(fc.x, fc.y);
			ctx.lineTo(tc.x, tc.y);
			ctx.stroke();
		}
		ctx.setLineDash([]);
		ctx.restore();
	}
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		const c = cell2px(child.to.x, child.to.y);
		ctx.fillStyle = 'rgba(26,20,13,0.88)';
		ctx.beginPath();
		ctx.arc(c.x, c.y, 12.0, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = 'rgba(255,217,89,1.0)';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(c.x, c.y, 12.0, 0, Math.PI * 2);
		ctx.stroke();
		ctx.save();
		ctx.fillStyle = 'rgba(255,230,140,1.0)';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = '16px "Microsoft YaHei UI", monospace';
		ctx.fillText(String(i + 1), c.x, c.y);
		ctx.restore();
	}
}

function drawSetupPalette() {
	if (mode !== 'setup') return;
	ctx.save();
	const paletteY = 770;
	ctx.fillStyle = 'rgba(40,28,16,0.9)';
	ctx.fillRect(0, paletteY - 10, CANVAS_W, CANVAS_H - paletteY + 10);
	const types = TYPE_LIST;
	const slotCount = types.length;
	const startX = (CANVAS_W - slotCount * SLOT_SIZE - (slotCount - 1) * SLOT_GAP) / 2;
	for (let row = 0; row < 2; row++) {
		const side = row === 0 ? 'red' : 'black';
		const y = paletteY + row * (SLOT_SIZE + SLOT_GAP);
		for (let col = 0; col < slotCount; col++) {
			const type = types[col];
			const x = startX + col * (SLOT_SIZE + SLOT_GAP);
			const cx = x + SLOT_SIZE / 2;
			const cy = y + SLOT_SIZE / 2;
			ctx.fillStyle = COLORS.setupPaletteSlot;
			ctx.fillRect(x, y, SLOT_SIZE, SLOT_SIZE);
			const isSel = setupPalette && setupPalette.side === side && setupPalette.type === type;
			if (isSel) {
				ctx.strokeStyle = COLORS.sel;
				ctx.lineWidth = 3;
				ctx.strokeRect(x + 2, y + 2, SLOT_SIZE - 4, SLOT_SIZE - 4);
			}
			const piece = new Piece(side, type);
			drawPieceDirect(cx, cy, piece, 40);
		}
	}
	const btnY = paletteY + 2 * (SLOT_SIZE + SLOT_GAP) + 8;
	const eraseBtn = { x: startX - 60, y: paletteY, w: 50, h: 2 * (SLOT_SIZE + SLOT_GAP) - SLOT_GAP };
	ctx.fillStyle = setupPalette === null ? '#5a3d22' : COLORS.setupPaletteSlot;
	ctx.fillRect(eraseBtn.x, eraseBtn.y, eraseBtn.w, eraseBtn.h);
	if (setupPalette === null) {
		ctx.strokeStyle = COLORS.sel;
		ctx.lineWidth = 3;
		ctx.strokeRect(eraseBtn.x + 2, eraseBtn.y + 2, eraseBtn.w - 4, eraseBtn.h - 4);
	}
	ctx.fillStyle = COLORS.text;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = '16px "Microsoft YaHei UI", sans-serif';
	ctx.fillText('擦除', eraseBtn.x + eraseBtn.w / 2, eraseBtn.y + eraseBtn.h / 2);
	const turnBtnW = 80;
	const turnBtnH = 32;
	const turnBtnX = startX + slotCount * (SLOT_SIZE + SLOT_GAP) + 10;
	const turnBtnY = paletteY + 10;
	ctx.fillStyle = setupRedFirst ? '#8b2820' : '#1a1a21';
	ctx.fillRect(turnBtnX, turnBtnY, turnBtnW, turnBtnH);
	ctx.strokeStyle = COLORS.sel;
	ctx.lineWidth = 1;
	ctx.strokeRect(turnBtnX, turnBtnY, turnBtnW, turnBtnH);
	ctx.fillStyle = COLORS.text;
	ctx.font = '14px "Microsoft YaHei UI", sans-serif';
	ctx.fillText(setupRedFirst ? '红先' : '黑先', turnBtnX + turnBtnW / 2, turnBtnY + turnBtnH / 2);
	const clearBtnX = turnBtnX;
	const clearBtnY = turnBtnY + turnBtnH + 6;
	ctx.fillStyle = COLORS.setupPaletteSlot;
	ctx.fillRect(clearBtnX, clearBtnY, turnBtnW, turnBtnH);
	ctx.strokeStyle = '#7a5e3a';
	ctx.lineWidth = 1;
	ctx.strokeRect(clearBtnX, clearBtnY, turnBtnW, turnBtnH);
	ctx.fillStyle = COLORS.text;
	ctx.fillText('清空棋盘', clearBtnX + turnBtnW / 2, clearBtnY + turnBtnH / 2);
	const startBtnX = clearBtnX + turnBtnW + 10;
	const startBtnY = turnBtnY;
	ctx.fillStyle = '#2d5a2d';
	ctx.fillRect(startBtnX, startBtnY, turnBtnW, turnBtnH * 2 + 6);
	ctx.strokeStyle = COLORS.sel;
	ctx.lineWidth = 1;
	ctx.strokeRect(startBtnX, startBtnY, turnBtnW, turnBtnH * 2 + 6);
	ctx.fillStyle = COLORS.text;
	ctx.font = '16px "Microsoft YaHei UI", sans-serif';
	ctx.fillText('开始对局', startBtnX + turnBtnW / 2, startBtnY + (turnBtnH * 2 + 6) / 2);
	drawSetupPalette._eraseBtn = eraseBtn;
	drawSetupPalette._turnBtn = { x: turnBtnX, y: turnBtnY, w: turnBtnW, h: turnBtnH };
	drawSetupPalette._clearBtn = { x: clearBtnX, y: clearBtnY, w: turnBtnW, h: turnBtnH };
	drawSetupPalette._startBtn = { x: startBtnX, y: startBtnY, w: turnBtnW, h: turnBtnH * 2 + 6 };
	drawSetupPalette._paletteStartX = startX;
	drawSetupPalette._paletteY = paletteY;
	drawSetupPalette._slotCount = slotCount;
	ctx.restore();
}

function drawTurnBar() {
	ctx.save();
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = '38px "Microsoft YaHei UI", sans-serif';
	ctx.fillStyle = COLORS.text;
	ctx.fillText('中国象棋', 400, 30);
	const turnSide = game.current_turn;
	const turnColor = turnSide === 'red' ? COLORS.redChar : COLORS.blackChar;
	let statusText = '';
	let statusColor = COLORS.text;
	if (gameOverMsg) {
		statusText = gameOverMsg;
		statusColor = COLORS.sel;
	} else if (game.winner) {
		const w = game.winner === 'red' ? '红胜' : '黑胜';
		statusText = `${w}！`;
		statusColor = COLORS.sel;
		gameOverMsg = statusText;
	} else {
		const sideName = turnSide === 'red' ? '红' : '黑';
		if (game._in_check(turnSide)) {
			statusText = `${sideName}方被将军！`;
			statusColor = COLORS.cap;
		} else {
			statusText = `轮到${sideName}方`;
			statusColor = turnColor;
		}
	}
	const depth = game.current_node ? game.current_node.getDepth() : 0;
	const stepText = `共 ${depth} 步`;
	const parts = [statusText, stepText];
	let x = 762.0;
	let y = 260.0;
	const stepY = 28.0;
	for (let i = 0; i < parts.length; i++) {
		if (i > 0) {
			ctx.fillStyle = COLORS.text;
			ctx.font = '20px "Microsoft YaHei UI", sans-serif';
			ctx.fillText('|', x, y);
			y += stepY;
		}
		const part = parts[i];
		const col = part.startsWith('轮到') || part.includes('将军') || part.includes('胜') ? statusColor : COLORS.text;
		ctx.fillStyle = col;
		ctx.font = '20px "Microsoft YaHei UI", sans-serif';
		for (const ch of part) {
			if (ch === ' ') continue;
			ctx.fillText(ch, x, y);
			y += stepY;
		}
	}
	const sideCircleX = 40;
	const sideCircleY = 50;
	ctx.fillStyle = turnColor;
	ctx.beginPath();
	ctx.arc(sideCircleX, sideCircleY, 16, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = '#fff';
	ctx.font = '14px "Microsoft YaHei UI", sans-serif';
	ctx.fillStyle = turnSide === 'red' ? '#fff' : '#ddd';
	ctx.fillText(turnSide === 'red' ? '红' : '黑', sideCircleX, sideCircleY);
	ctx.restore();
}

function collectPanelRows() {
	const rows = [];
	const currentPath = new Set();
	let cn = game.current_node;
	while (cn) {
		currentPath.add(cn);
		cn = cn._parent;
	}
	function append(node, depth, isMain) {
		const children = node.getChildren();
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			const childIsMain = isMain && i === 0;
			const depth2 = depth + 1;
			const moveNum = Math.ceil(depth2 / 2);
			const label = game._move_text({
				piece: child.piece,
				from: child.from,
				to: child.to,
			});
			let prefix = '';
			if (i > 0) {
				prefix = `变${i + 1} `;
			}
			let textLabel;
			if (depth2 % 2 === 1) {
				textLabel = `${moveNum}. ${label}`;
			} else {
				textLabel = `${moveNum}... ${label}`;
			}
			rows.push({
				depth: depth2,
				idx: rows.length,
				is_main: childIsMain,
				in_path: currentPath.has(child),
				node: child,
				prefix,
				text: prefix + textLabel,
				comment: child.comment || '',
				branch_count: child.getChildCount(),
				is_current: child === game.current_node,
			});
			append(child, depth2, childIsMain);
		}
	}
	append(game.root_node, 0, true);
	return rows;
}

function drawPGNPanel() {
	if (!panelOpen) return;
	const rows = panelRowsCache.length > 0 ? panelRowsCache : collectPanelRows();
	const visRows = Math.floor((PANEL_RECT.h - PANEL_HEADER_H) / PANEL_ROW_H);
	panelScroll = Math.max(0, Math.min(panelScroll, Math.max(0, rows.length - visRows)));
	ctx.save();
	ctx.fillStyle = COLORS.panelBg;
	ctx.fillRect(PANEL_RECT.x, PANEL_RECT.y, PANEL_RECT.w, PANEL_RECT.h);
	ctx.strokeStyle = COLORS.panelBrd;
	ctx.lineWidth = 2;
	ctx.strokeRect(PANEL_RECT.x, PANEL_RECT.y, PANEL_RECT.w, PANEL_RECT.h);
	let title = '棋谱 · P';
	if (game.current_node && game.current_node._parent) {
		const siblings = game.current_node._parent.getChildren();
		if (siblings.length > 1) {
			const idx = siblings.indexOf(game.current_node);
			title += `   分支 ${idx + 1}/${siblings.length}`;
		}
	}
	ctx.fillStyle = COLORS.text;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = '18px "Microsoft YaHei UI", sans-serif';
	ctx.fillText(title, PANEL_RECT.x + PANEL_RECT.w / 2, PANEL_RECT.y + 20);
	const closeX = PANEL_RECT.x + PANEL_RECT.w - 30;
	const closeY = PANEL_RECT.y + 20;
	ctx.fillStyle = COLORS.panText;
	ctx.font = '20px "Microsoft YaHei UI", sans-serif';
	ctx.fillText('×', closeX, closeY);
	drawPGNPanel._closeBtn = { x: closeX - 15, y: closeY - 15, w: 30, h: 30 };
	ctx.strokeStyle = 'rgba(128,104,72,0.8)';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(PANEL_RECT.x + 8, PANEL_RECT.y + PANEL_HEADER_H - 8);
	ctx.lineTo(PANEL_RECT.x + PANEL_RECT.w - 8, PANEL_RECT.y + PANEL_HEADER_H - 8);
	ctx.stroke();
	const listY = PANEL_RECT.y + PANEL_HEADER_H;
	for (let i = 0; i < visRows; i++) {
		const idx = panelScroll + i;
		if (idx >= rows.length) break;
		const row = rows[idx];
		const rowY = listY + i * PANEL_ROW_H;
		const cy = rowY + PANEL_ROW_H / 2;
		if (row.is_current) {
			ctx.fillStyle = COLORS.panCur;
			ctx.fillRect(PANEL_RECT.x + 3, rowY + 2, PANEL_RECT.w - 6, PANEL_ROW_H - 4);
		} else if (row.in_path) {
			ctx.fillStyle = COLORS.panPath;
			ctx.fillRect(PANEL_RECT.x + 3, rowY + 2, PANEL_RECT.w - 6, PANEL_ROW_H - 4);
		}
		const indent = Math.max(0, row.depth - 1) * 16;
		const textCol = row.is_current ? '#1a0f05' : (row.is_main ? COLORS.text : COLORS.panText);
		ctx.fillStyle = textCol;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';
		ctx.font = '15px "Microsoft YaHei UI", monospace';
		let label = row.text;
		if (!row.is_main && !row.prefix) {
			label = '· ' + label;
		}
		ctx.fillText(label, PANEL_RECT.x + 14 + indent, cy);
		if (row.branch_count > 1) {
			ctx.fillStyle = COLORS.panelHL;
			ctx.font = '13px "Microsoft YaHei UI", sans-serif';
			ctx.fillText(`[${row.branch_count}变]`, PANEL_RECT.x + PANEL_RECT.w - 70, cy);
		}
	}
	if (rows.length > visRows) {
		const barH = PANEL_RECT.h - PANEL_HEADER_H;
		const thumbH = Math.max(30, barH * visRows / rows.length);
		const maxScroll = Math.max(1, rows.length - visRows);
		const thumbY = listY + (barH - thumbH) * panelScroll / maxScroll;
		ctx.fillStyle = 'rgba(204,179,128,0.8)';
		ctx.fillRect(PANEL_RECT.x + PANEL_RECT.w - 7, thumbY, 4, thumbH);
	}
	drawPGNPanel._rows = rows;
	drawPGNPanel._listY = listY;
	drawPGNPanel._visRows = visRows;
	ctx.restore();
}

function drawLibPanel() {
	if (!libOpen) return;
	const visRows = Math.floor((LIB_RECT.h - LIB_HEADER_H) / LIB_ROW_H);
	libScroll = Math.max(0, Math.min(libScroll, Math.max(0, libList.length - visRows)));
	ctx.save();
	ctx.fillStyle = COLORS.panelBg;
	ctx.fillRect(LIB_RECT.x, LIB_RECT.y, LIB_RECT.w, LIB_RECT.h);
	ctx.strokeStyle = COLORS.panelBrd;
	ctx.lineWidth = 2;
	ctx.strokeRect(LIB_RECT.x, LIB_RECT.y, LIB_RECT.w, LIB_RECT.h);
	ctx.fillStyle = COLORS.text;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = '18px "Microsoft YaHei UI", sans-serif';
	ctx.fillText('棋谱库 · L', LIB_RECT.x + LIB_RECT.w / 2, LIB_RECT.y + 20);
	const btnW = 90;
	const btnH = 28;
	const btnY = LIB_RECT.y + LIB_HEADER_H - 30;
	const importBtn = { x: LIB_RECT.x + 20, y: btnY, w: btnW, h: btnH };
	const newBtn = { x: LIB_RECT.x + LIB_RECT.w / 2 - btnW / 2, y: btnY, w: btnW, h: btnH };
	const closeBtn = { x: LIB_RECT.x + LIB_RECT.w - btnW - 20, y: btnY, w: btnW, h: btnH };
	for (const b of [importBtn, newBtn, closeBtn]) {
		ctx.fillStyle = '#5a4630';
		ctx.fillRect(b.x, b.y, b.w, b.h);
		ctx.strokeStyle = COLORS.panelBrd;
		ctx.lineWidth = 1;
		ctx.strokeRect(b.x, b.y, b.w, b.h);
	}
	ctx.fillStyle = COLORS.text;
	ctx.font = '14px "Microsoft YaHei UI", sans-serif';
	ctx.fillText('导入PGN', importBtn.x + importBtn.w / 2, importBtn.y + importBtn.h / 2);
	ctx.fillText('新对局', newBtn.x + newBtn.w / 2, newBtn.y + newBtn.h / 2);
	ctx.fillText('关闭', closeBtn.x + closeBtn.w / 2, closeBtn.y + closeBtn.h / 2);
	drawLibPanel._importBtn = importBtn;
	drawLibPanel._newBtn = newBtn;
	drawLibPanel._closeBtn = closeBtn;
	ctx.strokeStyle = 'rgba(128,104,72,0.8)';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(LIB_RECT.x + 8, LIB_RECT.y + LIB_HEADER_H - 4);
	ctx.lineTo(LIB_RECT.x + LIB_RECT.w - 8, LIB_RECT.y + LIB_HEADER_H - 4);
	ctx.stroke();
	const listY = LIB_RECT.y + LIB_HEADER_H;
	drawLibPanel._listY = listY;
	if (libList.length === 0) {
		ctx.fillStyle = COLORS.panText;
		ctx.textAlign = 'left';
		ctx.font = '15px "Microsoft YaHei UI", sans-serif';
		ctx.fillText('暂无棋谱：对局结束后自动保存，或按 Ctrl+S 手动导出', LIB_RECT.x + 20, listY + 30);
	} else {
		for (let i = 0; i < visRows; i++) {
			const idx = libScroll + i;
			if (idx >= libList.length) break;
			const entry = libList[idx];
			const rowY = listY + i * LIB_ROW_H;
			const cy = rowY + LIB_ROW_H / 2;
			ctx.strokeStyle = 'rgba(100,80,50,0.4)';
			ctx.beginPath();
			ctx.moveTo(LIB_RECT.x + 8, rowY + LIB_ROW_H);
			ctx.lineTo(LIB_RECT.x + LIB_RECT.w - 8, rowY + LIB_ROW_H);
			ctx.stroke();
			const iconX = LIB_RECT.x + 24;
			ctx.fillStyle = COLORS.panelBrd;
			ctx.beginPath();
			ctx.arc(iconX, cy, 16, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = '#2a1810';
			ctx.font = 'bold 18px "Microsoft YaHei UI", sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText('谱', iconX, cy);
			ctx.textAlign = 'left';
			ctx.fillStyle = COLORS.text;
			ctx.font = '15px "Microsoft YaHei UI", sans-serif';
			const head = entry.pgnHead || {};
			const date = head.Date || (entry.modified ? new Date(entry.modified).toLocaleDateString() : '-');
			const result = head.Result || '*';
			const red = head.Red || '?';
			const black = head.Black || '?';
			let fname = entry.filename || `对局_${entry.id}.pgn`;
			if (fname.length > 28) fname = fname.substr(0, 28) + '…';
			ctx.fillText(fname, LIB_RECT.x + 54, cy - 10);
			ctx.fillStyle = COLORS.panText;
			ctx.font = '12px "Microsoft YaHei UI", sans-serif';
			ctx.fillText(`红:${red}  黑:${black}  结果:${result}  ${date}`, LIB_RECT.x + 54, cy + 12);
			const loadBtn = { x: LIB_RECT.x + LIB_RECT.w - 170, y: cy - 14, w: 68, h: 28 };
			const delBtn = { x: LIB_RECT.x + LIB_RECT.w - 92, y: cy - 14, w: 68, h: 28 };
			ctx.fillStyle = '#3a6a3a';
			ctx.fillRect(loadBtn.x, loadBtn.y, loadBtn.w, loadBtn.h);
			ctx.strokeStyle = '#5a8a5a';
			ctx.lineWidth = 1;
			ctx.strokeRect(loadBtn.x, loadBtn.y, loadBtn.w, loadBtn.h);
			ctx.fillStyle = '#8b3030';
			ctx.fillRect(delBtn.x, delBtn.y, delBtn.w, delBtn.h);
			ctx.strokeStyle = '#b05050';
			ctx.lineWidth = 1;
			ctx.strokeRect(delBtn.x, delBtn.y, delBtn.w, delBtn.h);
			ctx.fillStyle = '#fff';
			ctx.font = '13px "Microsoft YaHei UI", sans-serif';
			ctx.textAlign = 'center';
			ctx.fillText('载入', loadBtn.x + loadBtn.w / 2, loadBtn.y + loadBtn.h / 2);
			ctx.fillText('删除', delBtn.x + delBtn.w / 2, delBtn.y + delBtn.h / 2);
			if (!drawLibPanel._rowButtons) drawLibPanel._rowButtons = [];
			drawLibPanel._rowButtons[idx] = { load: loadBtn, del: delBtn, entry };
		}
	}
	if (libList.length > visRows) {
		const barH = LIB_RECT.h - LIB_HEADER_H;
		const thumbH = Math.max(30, barH * visRows / libList.length);
		const maxScroll = Math.max(1, libList.length - visRows);
		const thumbY = listY + (barH - thumbH) * libScroll / maxScroll;
		ctx.fillStyle = 'rgba(204,179,128,0.8)';
		ctx.fillRect(LIB_RECT.x + LIB_RECT.w - 7, thumbY, 4, thumbH);
	}
	drawLibPanel._visRows = visRows;
	drawLibPanel._libRect = LIB_RECT;
	ctx.restore();
}

function drawBottomHint() {
	ctx.save();
	if (errorMsg && errorTime > 0) {
		ctx.fillStyle = '#ff6655';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = '18px "Microsoft YaHei UI", sans-serif';
		ctx.fillText(errorMsg, 400, 100);
	}
	if (hintMsg && hintTime > 0) {
		ctx.fillStyle = 'rgba(255,230,130,1.0)';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = '18px "Microsoft YaHei UI", sans-serif';
		ctx.fillText(hintMsg, 400, 840);
	}
	let bottom;
	if (mode === 'setup') {
		const desc = setupPalette ? `${setupPalette.side === 'red' ? '红' : '黑'}方 ${CN_PIECE_CHAR[setupPalette.side][setupPalette.type]}` : '擦除';
		bottom = `放置：${desc}  [点击palette选子]  点棋子=移除  点空位=放置  [R]重开 [S]对局模式`;
	} else if (gameOverMsg) {
		bottom = `对局结束！${gameOverMsg}  [Ctrl+S]导出保存  [R]重新开局  [P]棋谱  [L]库`;
	} else {
		bottom = 'R=重开 S=布置 ←→=复盘 Tab=分支 P=棋谱 L=库 Ctrl+S=导出';
	}
	ctx.fillStyle = COLORS.text;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = '16px "Microsoft YaHei UI", sans-serif';
	ctx.fillText(bottom, 400, 878);
	ctx.restore();
}

function render() {
	if (!ctx) return;
	ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
	drawFrame();
	drawBoardBase();
	drawGrid();
	drawAllCornerMarks();
	drawRiver();
	drawAnnotations();
	drawLastMove();
	drawPieces();
	drawSelected();
	drawForkMarks();
	drawTurnBar();
	drawSetupPalette();
	drawPGNPanel();
	drawLibPanel();
	drawBottomHint();
}

function onMouseMove(e) {
	const rect = canvas.getBoundingClientRect();
	const px = (e.clientX - rect.left) * (CANVAS_W / rect.width);
	const py = (e.clientY - rect.top) * (CANVAS_H / rect.height);
	hover = { x: px, y: py };
	if (errorTime > 0) errorTime -= 16;
	if (hintTime > 0) hintTime -= 16;
	requestRender();
}

function pointInRect(px, py, r) {
	return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

function onMouseClick(e) {
	const rect = canvas.getBoundingClientRect();
	const px = (e.clientX - rect.left) * (CANVAS_W / rect.width);
	const py = (e.clientY - rect.top) * (CANVAS_H / rect.height);
	if (libOpen && pointInRect(px, py, LIB_RECT)) {
		handleLibClick(px, py);
		return;
	}
	if (panelOpen && pointInRect(px, py, PANEL_RECT)) {
		handlePanelClick(px, py);
		return;
	}
	if (mode === 'setup') {
		handleSetupClick(px, py);
		return;
	}
	handlePlayClick(px, py);
}

function handlePlayClick(px, py) {
	const cell = px2cell(px, py);
	if (cell === null) {
		selected = null;
		legalTargets = [];
		requestRender();
		return;
	}
	const piece = game.get_piece_at(cell.x, cell.y);
	if (selected === null) {
		if (piece !== null && piece.side === game.current_turn) {
			selected = { x: cell.x, y: cell.y };
			const all = game._gen_legal_moves(game.current_turn);
			legalTargets = all.filter(m => m.from.x === cell.x && m.from.y === cell.y);
			if (legalTargets.length === 0) {
				setHint('该棋子无合法走法');
			}
		} else {
			const sideName = game.current_turn === 'red' ? '红' : '黑';
			setHint(`轮到${sideName}方走子`);
		}
	} else {
		if (piece !== null && piece.side === game.current_turn) {
			selected = { x: cell.x, y: cell.y };
			const all = game._gen_legal_moves(game.current_turn);
			legalTargets = all.filter(m => m.from.x === cell.x && m.from.y === cell.y);
		} else {
			let targetMove = null;
			for (const m of legalTargets) {
				if (m.to.x === cell.x && m.to.y === cell.y) {
					targetMove = m;
					break;
				}
			}
			if (targetMove) {
				const ok = game.make_move(targetMove, { update_tree: true });
				if (ok) {
					lastMove = { from: { x: targetMove.from.x, y: targetMove.from.y }, to: { x: targetMove.to.x, y: targetMove.to.y } };
					selected = null;
					legalTargets = [];
					panelRowsCache = [];
					checkGameEnd();
				} else {
					setHint('走子失败：非法或对局已结束');
				}
			} else {
				selected = null;
				legalTargets = [];
				setHint('该走法不符合象棋规则');
			}
		}
	}
	requestRender();
}

function handleSetupClick(px, py) {
	const paletteY = drawSetupPalette._paletteY || 770;
	const startX = drawSetupPalette._paletteStartX || 100;
	const slotCount = drawSetupPalette._slotCount || 7;
	const eraseBtn = drawSetupPalette._eraseBtn;
	const turnBtn = drawSetupPalette._turnBtn;
	const clearBtn = drawSetupPalette._clearBtn;
	const startBtn = drawSetupPalette._startBtn;
	if (eraseBtn && pointInRect(px, py, eraseBtn)) {
		setupPalette = null;
		setHint('已选择擦除');
		requestRender();
		return;
	}
	if (turnBtn && pointInRect(px, py, turnBtn)) {
		setupRedFirst = !setupRedFirst;
		game.current_turn = setupRedFirst ? 'red' : 'black';
		setHint(`已切换为${setupRedFirst ? '红先' : '黑先'}`);
		requestRender();
		return;
	}
	if (clearBtn && pointInRect(px, py, clearBtn)) {
		for (let y = 0; y < 10; y++) {
			for (let x = 0; x < 9; x++) {
				game.board[y][x] = null;
			}
		}
		game.root_node.initial_board = game._clone_board(game.board);
		setHint('棋盘已清空');
		requestRender();
		return;
	}
	if (startBtn && pointInRect(px, py, startBtn)) {
		let redK = 0, blackK = 0;
		for (let y = 0; y < 10; y++) {
			for (let x = 0; x < 9; x++) {
				const p = game.board[y][x];
				if (p && p.type === 'K') {
					if (p.side === 'red') redK++;
					else blackK++;
				}
			}
		}
		if (redK !== 1 || blackK !== 1) {
			setError('双方必须各有一个将/帅才能开始对局');
			return;
		}
		mode = 'play';
		setupPalette = null;
		game.current_turn = setupRedFirst ? 'red' : 'black';
		game.root_node = new MoveNode();
		game.root_node.initial_board = game._clone_board(game.board);
		game.current_node = game.root_node;
		game.winner = null;
		gameOverMsg = '';
		setHint('布置完成，红方先行');
		requestRender();
		return;
	}
	if (py >= paletteY) {
		const row = Math.floor((py - paletteY) / (SLOT_SIZE + SLOT_GAP));
		if (row === 0 || row === 1) {
			const col = Math.floor((px - startX) / (SLOT_SIZE + SLOT_GAP));
			if (col >= 0 && col < slotCount) {
				const side = row === 0 ? 'red' : 'black';
				const type = TYPE_LIST[col];
				setupPalette = new Piece(side, type);
				setHint(`已选择${side === 'red' ? '红' : '黑'}方 ${CN_PIECE_CHAR[side][type]}`);
				requestRender();
			}
		}
		return;
	}
	const cell = px2cell(px, py);
	if (cell === null) return;
	if (setupPalette === null) {
		if (game.board[cell.y][cell.x] !== null) {
			game.board[cell.y][cell.x] = null;
			game.root_node.initial_board = game._clone_board(game.board);
			setHint('已移除棋子');
			requestRender();
		}
	} else {
		const piece = new Piece(setupPalette.side, setupPalette.type);
		game.board[cell.y][cell.x] = piece;
		game.root_node.initial_board = game._clone_board(game.board);
		setHint(`已放置${setupPalette.side === 'red' ? '红' : '黑'}方 ${CN_PIECE_CHAR[setupPalette.side][setupPalette.type]}`);
		requestRender();
	}
}

function handlePanelClick(px, py) {
	if (drawPGNPanel._closeBtn && pointInRect(px, py, drawPGNPanel._closeBtn)) {
		panelOpen = false;
		requestRender();
		return;
	}
	if (py < PANEL_RECT.y + PANEL_HEADER_H) return;
	const rows = drawPGNPanel._rows || panelRowsCache;
	const listY = drawPGNPanel._listY || (PANEL_RECT.y + PANEL_HEADER_H);
	const visRows = drawPGNPanel._visRows || Math.floor((PANEL_RECT.h - PANEL_HEADER_H) / PANEL_ROW_H);
	if (px >= PANEL_RECT.x + PANEL_RECT.w - 15) {
		return;
	}
	const rowIdx = Math.floor((py - listY) / PANEL_ROW_H) + panelScroll;
	if (rowIdx >= 0 && rowIdx < rows.length) {
		const row = rows[rowIdx];
		if (game.goto_node(row.node)) {
			lastMove = !row.node.isRoot() ? { from: row.node.from, to: row.node.to } : null;
			setHint(`跳到第 ${row.depth} 步`);
			panelRowsCache = [];
		}
	}
	requestRender();
}

function handleLibClick(px, py) {
	if (drawLibPanel._importBtn && pointInRect(px, py, drawLibPanel._importBtn)) {
		const input = document.getElementById('pgn-upload');
		if (input) input.click();
		return;
	}
	if (drawLibPanel._newBtn && pointInRect(px, py, drawLibPanel._newBtn)) {
		game.reset_board();
		selected = null;
		legalTargets = [];
		panelOpen = false;
		libOpen = false;
		mode = 'play';
		gameOverMsg = '';
		lastMove = null;
		currentLibraryId = null;
		currentLibraryFilename = null;
		currentBoundFile = null;
		libList = StorageManager.library.listGames();
		requestRender();
		return;
	}
	if (drawLibPanel._closeBtn && pointInRect(px, py, drawLibPanel._closeBtn)) {
		libOpen = false;
		requestRender();
		return;
	}
	const listY = drawLibPanel._listY || (LIB_RECT.y + LIB_HEADER_H);
	const visRows = drawLibPanel._visRows || Math.floor((LIB_RECT.h - LIB_HEADER_H) / LIB_ROW_H);
	if (drawLibPanel._rowButtons) {
		for (let idx = libScroll; idx < libScroll + visRows && idx < libList.length; idx++) {
			const rb = drawLibPanel._rowButtons[idx];
			if (!rb) continue;
			if (pointInRect(px, py, rb.del)) {
				try {
					StorageManager.library.deleteGame(rb.entry.id);
					if (currentLibraryId === rb.entry.id) {
						currentLibraryId = null;
						currentLibraryFilename = null;
						currentBoundFile = null;
					}
					FileHandleStore.delete(rb.entry.id).catch(() => {});
					libList = StorageManager.library.listGames();
					setHint(`已删除 ${rb.entry.filename || rb.entry.id}`);
				} catch (e) {
					setError('删除失败: ' + (e.message || e));
				}
				requestRender();
				return;
			}
			if (pointInRect(px, py, rb.load)) {
				try {
					const pgn = StorageManager.library.loadGame(rb.entry.id);
					if (pgn) {
						const ok = game.import_pgn(pgn);
						if (ok) {
							mode = 'play';
							panelOpen = false;
							libOpen = false;
							selected = null;
							legalTargets = [];
							gameOverMsg = '';
							lastMove = !game.current_node.isRoot() ? { from: game.current_node.from, to: game.current_node.to } : null;
							currentLibraryId = rb.entry.id;
							currentLibraryFilename = rb.entry.filename || null;
							// 载入棋谱时同步恢复该ID绑定的磁盘文件（若存在），这样后续保存直接覆盖同文件。
							currentBoundFile = null;
							FileHandleStore.get(rb.entry.id).then(rec => {
								if (rec && rec.libraryId === rb.entry.id) {
									currentBoundFile = {
										libraryId: rec.libraryId,
										handle: rec.handle || null,
										pathHint: rec.pathHint || null,
										updatedAt: rec.updatedAt || 0,
									};
									const msg = rec.pathHint ? `，已连接磁盘文件 ${rec.pathHint}` : '';
									setHint(`已加载 ${rb.entry.filename || rb.entry.id}${msg}`);
								}
							}).catch(() => { /* ignore */ });
							setHint(`已加载 ${rb.entry.filename || rb.entry.id}`);
							game._emit_position_changed();
						} else {
							setError('棋谱解析失败');
						}
					}
				} catch (err) {
					setError('加载失败: ' + (err.message || err));
				}
				requestRender();
				return;
			}
		}
	}
}

function onMouseWheel(e) {
	e.preventDefault();
	if (libOpen) {
		if (e.deltaY > 0) libScroll += 3;
		else libScroll = Math.max(0, libScroll - 3);
		requestRender();
		return;
	}
	if (panelOpen) {
		if (e.deltaY > 0) panelScroll += 3;
		else panelScroll = Math.max(0, panelScroll - 3);
		requestRender();
		return;
	}
	if (e.shiftKey) {
		game.switch_variation(e.deltaY > 0 ? +1 : -1);
	} else {
		if (e.deltaY < 0) game.undo_move();
		else game.redo_move();
	}
	if (game.current_node && !game.current_node.isRoot()) {
		lastMove = { from: game.current_node.from, to: game.current_node.to };
	} else {
		lastMove = null;
	}
	requestRender();
}

function onKeyDown(e) {
	const ctrl = e.ctrlKey || e.metaKey;
	if (ctrl && (e.key === 's' || e.key === 'S')) {
		e.preventDefault();
		exportPGN();
		return;
	}
	if (ctrl && (e.key === 'o' || e.key === 'O')) {
		e.preventDefault();
		const input = document.getElementById('pgn-upload');
		if (input) input.click();
		return;
	}
	switch (e.key) {
		case 'ArrowLeft':
		case 'ArrowUp':
			game.undo_move();
			if (game.current_node && !game.current_node.isRoot()) {
				lastMove = { from: game.current_node.from, to: game.current_node.to };
			} else {
				lastMove = null;
			}
			requestRender();
			e.preventDefault();
			break;
		case 'ArrowRight':
		case 'ArrowDown':
			game.redo_move();
			if (game.current_node && !game.current_node.isRoot()) {
				lastMove = { from: game.current_node.from, to: game.current_node.to };
			}
			requestRender();
			e.preventDefault();
			break;
		case 'Tab':
			game.switch_variation(e.shiftKey ? -1 : +1);
			if (game.current_node && !game.current_node.isRoot()) {
				lastMove = { from: game.current_node.from, to: game.current_node.to };
			}
			requestRender();
			e.preventDefault();
			break;
		case 'r':
		case 'R':
			game.reset_board();
			selected = null;
			legalTargets = [];
			panelOpen = false;
			libOpen = false;
			mode = 'play';
			gameOverMsg = '';
			lastMove = null;
			panelRowsCache = [];
			currentLibraryId = null;
			currentLibraryFilename = null;
			currentBoundFile = null;
			setHint('已重新开局，红方先行');
			requestRender();
			break;
		case 's':
		case 'S':
			if (mode !== 'setup') {
				// 进入布置模式：彻底清理棋盘并重开一个布置起点，解绑当前棋谱
				mode = 'setup';
				selected = null;
				legalTargets = [];
				setupPalette = null;
				game._clear_board();
				game.root_node = new MoveNode();
				game.root_node.initial_board = game._clone_board(game.board);
				game.current_node = game.root_node;
				game.current_turn = 'red';
				setupRedFirst = true;
				gameOverMsg = '';
				game.winner = null;
				currentLibraryId = null;
				currentLibraryFilename = null;
				currentBoundFile = null;
				setHint('布置模式：palette选子，点格放置，点棋子移除；按 S 返回对局模式');
			} else {
				// 从布置模式切回对局模式：把当前摆好的棋盘当作初始局面，并应用 setupRedFirst 决定先手
				game.root_node = new MoveNode();
				game.root_node.initial_board = game._clone_board(game.board);
				game.current_node = game.root_node;
				game.current_turn = setupRedFirst ? 'red' : 'black';
				gameOverMsg = '';
				game.winner = null;
				mode = 'play';
				selected = null;
				legalTargets = [];
				currentBoundFile = null;
				setHint(`布置完成，${game.current_turn === 'red' ? '红' : '黑'}方先行；当前为新对局`);
			}
			requestRender();
			break;
		case 'p':
		case 'P':
			panelOpen = !panelOpen;
			libOpen = false;
			if (panelOpen) {
				panelRowsCache = collectPanelRows();
				panelScroll = 0;
			}
			requestRender();
			break;
		case 'l':
		case 'L':
			libOpen = !libOpen;
			panelOpen = false;
			if (libOpen) {
				libList = StorageManager.library.listGames();
				libScroll = 0;
				if (drawLibPanel._rowButtons) drawLibPanel._rowButtons = [];
			}
			requestRender();
			break;
		case 'e':
		case 'E':
			exportPGN();
			break;
		case 'i':
		case 'I':
			const input = document.getElementById('pgn-upload');
			if (input) input.click();
			break;
		case 'Escape':
			if (libOpen) {
				libOpen = false;
				requestRender();
			} else if (panelOpen) {
				panelOpen = false;
				requestRender();
			}
			break;
	}
}

function checkGameEnd() {
	const nextSide = game.current_turn;
	const legal = game._gen_legal_moves(nextSide);
	if (legal.length === 0) {
		const inCheck = game._in_check(nextSide);
		const winnerSide = nextSide === 'red' ? 'black' : 'red';
		if (inCheck) {
			game.winner = winnerSide;
			if (game.current_node) game.current_node.winner = winnerSide;
			gameOverMsg = `${winnerSide === 'red' ? '红' : '黑'}胜（将死）`;
		} else {
			game.winner = winnerSide;
			if (game.current_node) game.current_node.winner = winnerSide;
			gameOverMsg = `${winnerSide === 'red' ? '红' : '黑'}胜（困毙）`;
		}
		setTimeout(autoSavePGN, 100);
	}
}

function _buildSaveFilename() {
	let resultStr = '未分胜负';
	if (game.winner === 'red') resultStr = '红胜';
	else if (game.winner === 'black') resultStr = '黑胜';
	return StorageManager.library.generateFilename({ result: resultStr });
}

function saveCurrentGameToLibrary() {
	const pgn = game.export_pgn();
	let filename;
	if (currentLibraryId) {
		const res = StorageManager.library.updateGame(currentLibraryId, pgn, undefined);
		filename = res.filename;
		if (res.id_renewed) {
			// localStorage 里原 ID 不存在被回退重建：也要把磁盘绑定从旧 ID 迁到新 ID（迁不走就解绑定）
			const oldId = currentLibraryId;
			currentLibraryId = res.id;
			if (currentBoundFile && currentBoundFile.libraryId === oldId) {
				currentBoundFile.libraryId = res.id;
				FileHandleStore.put(res.id, {
					handle: currentBoundFile.handle,
					pathHint: currentBoundFile.pathHint,
				}).catch(() => {});
				FileHandleStore.delete(oldId).catch(() => {});
			} else {
				currentBoundFile = null;
			}
		}
		currentLibraryFilename = filename || currentLibraryFilename;
	} else {
		filename = _buildSaveFilename();
		const res = StorageManager.library.saveGame(pgn, filename);
		currentLibraryId = res.id;
		currentLibraryFilename = res.filename || filename;
	}
	libList = StorageManager.library.listGames();
	return { filename, id: currentLibraryId, pgn };
}

// 核心：把当前 PGN 写到与 currentLibraryId 绑定的磁盘文件里。
// 逻辑：
//   1) 已有绑定 handle → 直接覆盖写入（无下载，无副本）。
//   2) 无绑定但浏览器支持 File System Access API + 允许用户手势（用户主动 Ctrl+S）
//      → 调用 showSaveFilePicker 让用户选路径；选定后立即写入 + 建立 libraryId ↔ handle 持久绑定。
//   3) 不支持 / 用户取消 / 自动保存（无用户手势无法弹出 picker）
//      → diskWrite 失败，返回 { disk: 'skipped' }；此时库 localStorage 已经通过 saveCurrentGameToLibrary 成功保存。
async function saveCurrentBoundFile({ allowPickNew = false } = {}) {
	const pgn = game.export_pgn();
	if (!currentLibraryId) {
		// 这种情况先保存到库拿到 ID，再可能绑定磁盘文件
		saveCurrentGameToLibrary();
	}
	const libraryId = currentLibraryId;
	if (!libraryId) return { disk: 'skipped', reason: 'no-library-id' };

	// 情况 1：内存里已有绑定 → 直接覆盖磁盘同文件
	const handleFromMemory = (currentBoundFile && currentBoundFile.libraryId === libraryId && currentBoundFile.handle) ? currentBoundFile.handle : null;
	if (handleFromMemory) {
		const r = await FileHandleStore.writePGNToBoundHandle(handleFromMemory, pgn);
		if (r.ok) {
			currentBoundFile = {
				libraryId,
				handle: handleFromMemory,
				pathHint: r.pathHint || (currentBoundFile ? currentBoundFile.pathHint : null),
				updatedAt: Date.now(),
			};
			FileHandleStore.put(libraryId, {
				handle: handleFromMemory,
				pathHint: currentBoundFile.pathHint,
			}).catch(() => {});
			return { disk: 'updated-overwrite', pathHint: r.pathHint, size: r.size };
		}
		// 覆盖失败（权限过期、句柄失效、文件删除过） → 标记内存态失效，等用户重新选路径
		currentBoundFile = null;
		FileHandleStore.delete(libraryId).catch(() => {});
		// 让后续流程按「API 不支持 / 无绑定」回退
	}

	// 情况 2：无绑定 → 尝试从 IDB 恢复持久绑定（比如载入棋谱时 FileHandleStore.get 还没回来）
	if (!currentBoundFile || !currentBoundFile.handle) {
		try {
			const rec = await FileHandleStore.get(libraryId);
			if (rec && rec.handle) {
				const r = await FileHandleStore.writePGNToBoundHandle(rec.handle, pgn);
				if (r.ok) {
					currentBoundFile = {
						libraryId,
						handle: rec.handle,
						pathHint: r.pathHint || rec.pathHint || null,
						updatedAt: Date.now(),
					};
					return { disk: 'updated-after-restore', pathHint: r.pathHint, size: r.size };
				} else {
					// 句柄失效，从 IDB 清掉
					FileHandleStore.delete(libraryId).catch(() => {});
				}
			}
		} catch (e) { /* ignore */ }
	}

	// 情况 3：仍然无有效句柄 → 允许用户手势 pick 新文件路径（Ctrl+S）
	if (allowPickNew && FileHandleStore.SUPPORTS_NATIVE_FILE_SYSTEM) {
		const suggested = currentLibraryFilename || _buildSaveFilename();
		const pick = await FileHandleStore.pickPGNSaveFile(suggested);
		if (pick.ok && pick.handle) {
			// 写入新路径
			const w = await FileHandleStore.writePGNToBoundHandle(pick.handle, pgn);
			if (w.ok) {
				currentBoundFile = {
					libraryId,
					handle: pick.handle,
					pathHint: w.pathHint || pick.pathHint || null,
					updatedAt: Date.now(),
				};
				currentLibraryFilename = currentLibraryFilename || (currentBoundFile.pathHint || suggested);
				try {
					await FileHandleStore.put(libraryId, {
						handle: pick.handle,
						pathHint: currentBoundFile.pathHint,
					});
				} catch (e) { /* ignore */ }
				return { disk: 'new-bound-picked', pathHint: currentBoundFile.pathHint, size: w.size };
			} else {
				return { disk: 'skipped', reason: 'write-after-pick-failed', message: w.message };
			}
		} else if (pick.reason === 'user-canceled') {
			return { disk: 'skipped', reason: 'user-canceled-pick' };
		} else if (pick.reason === 'unsupported') {
			// 继续走下面回退
		} else {
			return { disk: 'skipped', reason: pick.reason || 'picker-failed', message: pick.message };
		}
	}

	// 情况 4：所有路径都不行 → 磁盘层放弃，localStorage 层已成功保存
	return { disk: 'skipped', reason: FileHandleStore.SUPPORTS_NATIVE_FILE_SYSTEM ? 'no-bound-no-pick' : 'unsupported-platform' };
}

async function exportPGN() {
	try {
		const countBeforeLibView = StorageManager.library.listGames().length;
		const idBefore = currentLibraryId;
		const pgn = game.export_pgn();
		// 1) localStorage 棋谱库保存（更新 / 新建一条，确保有 libraryId 唯一序列号）
		const saved = saveCurrentGameToLibrary();
		const list = StorageManager.library.listGames();
		const countAfter = list.length;
		const created = (idBefore == null) && countAfter > countBeforeLibView;
		const updated = idBefore != null && countAfter === Math.max(countBeforeLibView, 1);
		const libTag = created ? '新增' : updated ? '更新' : '已';
		const libIdView = saved.id ? saved.id.slice(0, 8) : '';

		// 2) 磁盘文件层：优先「同一 libraryId 覆盖用户最初选定的那一个 .pgn 文件」，避免浏览器下载 (1)(2) 副本
		const diskRes = await saveCurrentBoundFile({ allowPickNew: true });
		let hint;
		if (diskRes.disk && diskRes.disk.startsWith('updated')) {
			const where = diskRes.pathHint ? `「${diskRes.pathHint}」` : '绑定的磁盘文件';
			const extra = countAfter === countBeforeLibView ? `（棋谱库 ${countAfter} 条，同条目内同步更新）` : '';
			hint = `✅ 已覆盖同一份棋谱文件 ${where}，不会在下载区生成新副本。棋谱库 ${libTag} ID=${libIdView} ${extra}`;
		} else if (diskRes.disk === 'new-bound-picked') {
			const where = diskRes.pathHint ? `「${diskRes.pathHint}」` : '选定的磁盘文件';
			hint = `✅ 已建立磁盘绑定：本局序列 ID=${libIdView} ↔ ${where}。后续 Ctrl+S / 自动结束保存将直接覆盖这同一个文件，不再生成副本。`;
		} else {
			// 无法 File System Access：回退到传统 a[download] 下载
			const filename = currentLibraryFilename || _buildSaveFilename();
			StorageManager.fileIO.exportAsDownload(pgn, filename);
			const dlExplain = '当前浏览器不支持直接覆盖磁盘文件（Firefox/Safari）。若使用 Chrome/Edge 86+，会弹出另存为让你选择一个位置，之后会一直覆盖该文件不再生成副本。';
			const extra = countAfter === countBeforeLibView ? `棋谱库仍为 ${countAfter} 条，未新建条目。` : '';
			hint = `${libTag} 棋谱：${saved.filename} [库 ID:${libIdView}] ${extra} · ${dlExplain}`;
		}
		setHint(hint);
	} catch (err) {
		setError('导出失败: ' + (err.message || err));
	}
}

function autoSavePGN() {
	// autoSavePGN 没有用户手势，showSaveFilePicker 会被浏览器拒绝。
	// 所以：先入库 localStorage（保证 100% 存到库）；如果已有绑定磁盘 handle，顺手覆盖写磁盘文件。
	(async () => {
		try {
			saveCurrentGameToLibrary();
			if (currentLibraryId && currentBoundFile && currentBoundFile.handle) {
				await saveCurrentBoundFile({ allowPickNew: false });
			}
		} catch (e) {
			// 自动吞错误，避免页面被异常中断
		}
	})();
}

function setupUploadInput() {
	const input = document.getElementById('pgn-upload');
	if (!input) return;
	input.addEventListener('change', (e) => {
		const file = e.target.files && e.target.files[0];
		if (!file) return;
		StorageManager.fileIO.importFromFile(file).then(pgn => {
			const ok = game.import_pgn(pgn);
			if (ok) {
				mode = 'play';
				selected = null;
				legalTargets = [];
				gameOverMsg = '';
				panelOpen = false;
				libOpen = false;
				lastMove = !game.current_node.isRoot() ? { from: game.current_node.from, to: game.current_node.to } : null;
				currentLibraryId = null;
				currentLibraryFilename = null;
				currentBoundFile = null;
				setHint(`已导入 ${file.name}`);
				game._emit_position_changed();
			} else {
				setError('PGN 解析失败，请检查文件格式');
			}
		}).catch(err => {
			setError('导入失败: ' + (err.message || err));
		});
		e.target.value = '';
	});
}

document.addEventListener('DOMContentLoaded', () => {
	canvas = document.getElementById('board');
	if (!canvas) return;
	ctx = canvas.getContext('2d');
	game = new XiangqiGame();
	game.reset_board();
	loadPieceImages();
	setupUploadInput();
	if (!gameEventsConnected) {
		game.onPositionChanged.push(requestRender);
		gameEventsConnected = true;
	}
	canvas.addEventListener('mousemove', onMouseMove);
	canvas.addEventListener('click', onMouseClick);
	canvas.addEventListener('wheel', onMouseWheel, { passive: false });
	window.addEventListener('keydown', onKeyDown);
	// 暴露关键状态给浏览器调试/测试：刷新 __xq 快照
	const snap = () => ({
		currentLibraryId,
		currentLibraryFilename,
		currentBoundFile: currentBoundFile
			? {
				libraryId: currentBoundFile.libraryId,
				pathHint: currentBoundFile.pathHint,
				updatedAt: currentBoundFile.updatedAt,
				hasHandle: !!currentBoundFile.handle,
			  }
			: null,
		mode,
		current_turn: game.current_turn,
		winner: game.winner,
		currentIsRoot: game.current_node && game.current_node.isRoot(),
		pieceCount: (() => { let n = 0; for (let y=0;y<10;y++) for (let x=0;x<9;x++) if (game.board[y][x]) n++; return n; })(),
		libCount: libList.length,
		panelOpen, libOpen, gameOverMsg,
		supportsFS: FileHandleStore.SUPPORTS_NATIVE_FILE_SYSTEM,
	});
	window.__xq = {
		get state() { return snap(); },
		_storage: StorageManager,
		_handleStore: FileHandleStore,
		_game: game,
		_saveCurrent: saveCurrentGameToLibrary,
		_saveBound: saveCurrentBoundFile,
		_export: exportPGN,
		_auto: autoSavePGN,
		_setModePlay: () => { mode = 'play'; },
		_keys: { onKeyDown, onMouseClick, requestRender },
		// 测试辅助：直接调用「载入棋谱库条目」按钮的效果（从库 ID 载入并回填 currentLibraryId + 恢复磁盘绑定）
		async _loadFromLibrary(entryOrId) {
			const id = typeof entryOrId === 'string' ? entryOrId : entryOrId && entryOrId.id;
			if (!id) return { ok: false, reason: 'no-id' };
			const pgn = StorageManager.library.loadGame(id);
			if (!pgn) return { ok: false, reason: 'pgn-not-found' };
			const metaKey = StorageManager.library.KEY_PREFIX + id + '::meta';
			let filename = null;
			try {
				const m = localStorage.getItem(metaKey);
				if (m) filename = (JSON.parse(m) || {}).filename || null;
			} catch (e) { /* ignore */ }
			const ok = game.import_pgn(pgn);
			if (!ok) return { ok: false, reason: 'import-failed' };
			mode = 'play';
			panelOpen = false;
			libOpen = false;
			selected = null;
			legalTargets = [];
			gameOverMsg = '';
			lastMove = !game.current_node.isRoot() ? { from: game.current_node.from, to: game.current_node.to } : null;
			currentLibraryId = id;
			currentLibraryFilename = filename;
			// 同步恢复磁盘绑定
			currentBoundFile = null;
			try {
				const rec = await FileHandleStore.get(id);
				if (rec && rec.libraryId === id) {
					currentBoundFile = {
						libraryId: rec.libraryId,
						handle: rec.handle || null,
						pathHint: rec.pathHint || null,
						updatedAt: rec.updatedAt || 0,
					};
				}
			} catch (e) { /* ignore */ }
			game._emit_position_changed();
			requestRender();
			return { ok: true, id, filename, bound: currentBoundFile ? { hasHandle: !!currentBoundFile.handle, pathHint: currentBoundFile.pathHint } : null };
		},
		// 测试辅助：强制清空 currentLibrary 绑定（模拟新局）
		_unbindLibrary() {
			currentLibraryId = null;
			currentLibraryFilename = null;
			currentBoundFile = null;
		},
		// 调试：直接手动 set 假的绑定句柄（用 File System Access API pick 一个文件），模拟「已经绑定磁盘文件」的场景
		async _debugMockBindPick(suggestedName) {
			if (!FileHandleStore.SUPPORTS_NATIVE_FILE_SYSTEM) return { ok: false, reason: 'unsupported' };
			const pick = await FileHandleStore.pickPGNSaveFile(suggestedName || _buildSaveFilename());
			if (!pick.ok || !pick.handle) return { ok: false, reason: pick.reason || 'picker-failed' };
			saveCurrentGameToLibrary();
			const id = currentLibraryId;
			if (!id) return { ok: false, reason: 'no-id' };
			currentBoundFile = { libraryId: id, handle: pick.handle, pathHint: pick.pathHint || null, updatedAt: Date.now() };
			await FileHandleStore.put(id, { handle: pick.handle, pathHint: currentBoundFile.pathHint });
			return { ok: true, id, pathHint: currentBoundFile.pathHint };
		},
	};
	requestRender();
});
