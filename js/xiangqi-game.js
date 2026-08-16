const RED = 'red';
const BLACK = 'black';
const COLUMNS = 9;
const ROWS = 10;

const TYPE_GENERAL = 'K';
const TYPE_ADVISOR = 'A';
const TYPE_ELEPHANT = 'E';
const TYPE_HORSE = 'H';
const TYPE_CHARIOT = 'R';
const TYPE_CANNON = 'C';
const TYPE_SOLDIER = 'S';

const TYPE_CHARS = {
	[TYPE_GENERAL]: ['帅', '将'],
	[TYPE_ADVISOR]: ['仕', '士'],
	[TYPE_ELEPHANT]: ['相', '象'],
	[TYPE_HORSE]: ['马', '马'],
	[TYPE_CHARIOT]: ['车', '车'],
	[TYPE_CANNON]: ['炮', '炮'],
	[TYPE_SOLDIER]: ['兵', '卒'],
};

const HORSE_STEPS = [
	{ x: 1, y: 2 }, { x: 2, y: 1 }, { x: 2, y: -1 }, { x: 1, y: -2 },
	{ x: -1, y: -2 }, { x: -2, y: -1 }, { x: -2, y: 1 }, { x: -1, y: 2 },
];

const FEN_LETTERS = {
	[TYPE_CHARIOT]: 'R', [TYPE_HORSE]: 'N', [TYPE_ELEPHANT]: 'B',
	[TYPE_ADVISOR]: 'A', [TYPE_GENERAL]: 'K', [TYPE_CANNON]: 'C', [TYPE_SOLDIER]: 'P',
};

const CN_NUMS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

class Piece {
	constructor(side, type) {
		this.side = side;
		this.type = type;
	}

	static CHAR_TABLE = {
		'K': { side: RED, type: TYPE_GENERAL },
		'A': { side: RED, type: TYPE_ADVISOR },
		'B': { side: RED, type: TYPE_ELEPHANT },
		'N': { side: RED, type: TYPE_HORSE },
		'R': { side: RED, type: TYPE_CHARIOT },
		'C': { side: RED, type: TYPE_CANNON },
		'P': { side: RED, type: TYPE_SOLDIER },
		'k': { side: BLACK, type: TYPE_GENERAL },
		'a': { side: BLACK, type: TYPE_ADVISOR },
		'b': { side: BLACK, type: TYPE_ELEPHANT },
		'n': { side: BLACK, type: TYPE_HORSE },
		'r': { side: BLACK, type: TYPE_CHARIOT },
		'c': { side: BLACK, type: TYPE_CANNON },
		'p': { side: BLACK, type: TYPE_SOLDIER },
	};

	static fromChar(c) {
		const entry = Piece.CHAR_TABLE[c];
		if (!entry) return null;
		return new Piece(entry.side, entry.type);
	}

	static toChar(p) {
		if (!p) return '';
		const letter = FEN_LETTERS[p.type];
		return p.side === RED ? letter : letter.toLowerCase();
	}
}

class MoveNode {
	constructor() {
		this.from = { x: -1, y: -1 };
		this.to = { x: -1, y: -1 };
		this.piece = null;
		this.captured = null;
		this.moveText = '';
		this.comment = '';
		this._parent = null;
		this._children = [];
		this._index = 0;
		this.winner = null;
		this.initial_board = null;
	}

	addChild(child) {
		child._parent = this;
		child._index = this._children.length;
		this._children.push(child);
	}

	removeChild() {
		if (!this._parent) return;
		const siblings = this._parent._children;
		const idx = siblings.indexOf(this);
		if (idx >= 0) {
			siblings.splice(idx, 1);
			for (let i = idx; i < siblings.length; i++) {
				siblings[i]._index = i;
			}
		}
		this._parent = null;
	}

	getChildren() {
		return this._children;
	}

	hasChildren() {
		return this._children.length > 0;
	}

	getChildCount() {
		return this._children.length;
	}

	getIndexInParent() {
		if (!this._parent) return 0;
		return this._index;
	}

	getDepth() {
		let d = 0;
		let node = this._parent;
		while (node) {
			d++;
			node = node._parent;
		}
		return d;
	}

	isRoot() {
		return this._parent === null;
	}
}

class XiangqiGame {
	constructor() {
		this.board = [];
		this.current_turn = RED;
		this.winner = null;
		this.root_node = null;
		this.current_node = null;
		this.board_stack = [];
		this.onPositionChanged = [];
		this._elephant_black = {};
		this._elephant_red = {};
		this._parse_cursor = 0;
		this._parse_anchors = [];
		this._compute_elephant_spots();
		this.reset_board();
	}

	_emit_position_changed() {
		for (const cb of this.onPositionChanged) {
			try { cb(); } catch (e) {}
		}
	}

	_clone_board(src) {
		const b = [];
		for (let y = 0; y < ROWS; y++) {
			const row = [];
			for (let x = 0; x < COLUMNS; x++) {
				const p = src[y][x];
				row.push(p ? new Piece(p.side, p.type) : null);
			}
			b.push(row);
		}
		return b;
	}

	_clear_board() {
		this.board = [];
		for (let y = 0; y < ROWS; y++) {
			const row = [];
			for (let x = 0; x < COLUMNS; x++) {
				row.push(null);
			}
			this.board.push(row);
		}
	}

	_setup_standard() {
		const back_rank = [
			TYPE_CHARIOT, TYPE_HORSE, TYPE_ELEPHANT, TYPE_ADVISOR, TYPE_GENERAL,
			TYPE_ADVISOR, TYPE_ELEPHANT, TYPE_HORSE, TYPE_CHARIOT,
		];
		for (let x = 0; x < COLUMNS; x++) {
			this.board[0][x] = new Piece(BLACK, back_rank[x]);
			this.board[9][x] = new Piece(RED, back_rank[x]);
		}
		this.board[2][1] = new Piece(BLACK, TYPE_CANNON);
		this.board[2][7] = new Piece(BLACK, TYPE_CANNON);
		this.board[7][1] = new Piece(RED, TYPE_CANNON);
		this.board[7][7] = new Piece(RED, TYPE_CANNON);
		for (const x of [0, 2, 4, 6, 8]) {
			this.board[3][x] = new Piece(BLACK, TYPE_SOLDIER);
			this.board[6][x] = new Piece(RED, TYPE_SOLDIER);
		}
	}

	_build_root_tree() {
		this.root_node = new MoveNode();
		this.root_node.initial_board = this._clone_board(this.board);
		this.current_node = this.root_node;
	}

	reset_board() {
		this._clear_board();
		this._setup_standard();
		this._build_root_tree();
		this.current_turn = RED;
		this.winner = null;
		this.board_stack = [];
		this._emit_position_changed();
	}

	new_game() {
		this.reset_board();
	}

	is_on_board(x, y) {
		return x >= 0 && x < COLUMNS && y >= 0 && y < ROWS;
	}

	is_empty(x, y) {
		if (!this.is_on_board(x, y)) return false;
		return this.board[y][x] === null;
	}

	get_piece_at(x, y) {
		if (!this.is_on_board(x, y)) return null;
		return this.board[y][x];
	}

	is_in_palace(x, y, side) {
		if (x < 3 || x > 5) return false;
		if (side === BLACK) return y >= 0 && y <= 2;
		return y >= 7 && y <= 9;
	}

	_is_advisor_spot(side, x, y) {
		if (!this.is_in_palace(x, y, side)) return false;
		return (x === 4 && (y === 1 || y === 8)) || (x !== 4 && (y === 0 || y === 2 || y === 7 || y === 9));
	}

	is_on_own_side(y, side) {
		if (side === BLACK) return y <= 4;
		return y >= 5;
	}

	_compute_elephant_spots() {
		for (const side of [BLACK, RED]) {
			const spots = {};
			const start_y = side === BLACK ? 0 : 9;
			const queue = [{ x: 2, y: start_y }, { x: 6, y: start_y }];
			for (const s of queue) {
				spots[`${s.x},${s.y}`] = true;
			}
			while (queue.length > 0) {
				const cur = queue.shift();
				for (const dx of [-2, 2]) {
					for (const dy of [-2, 2]) {
						const nx = cur.x + dx;
						const ny = cur.y + dy;
						if (!this.is_on_board(nx, ny)) continue;
						if (side === BLACK && ny > 4) continue;
						if (side === RED && ny < 5) continue;
						const key = `${nx},${ny}`;
						if (!spots[key]) {
							spots[key] = true;
							queue.push({ x: nx, y: ny });
						}
					}
				}
			}
			if (side === BLACK) this._elephant_black = spots;
			else this._elephant_red = spots;
		}
	}

	_is_elephant_spot(side, x, y) {
		if (!this.is_on_board(x, y)) return false;
		const key = `${x},${y}`;
		return side === BLACK ? !!this._elephant_black[key] : !!this._elephant_red[key];
	}

	_get_pseudo_moves(x, y) {
		const result = [];
		const piece = this.get_piece_at(x, y);
		if (!piece) return result;
		const side = piece.side;
		switch (piece.type) {
			case TYPE_GENERAL: this._moves_general(x, y, side, result); break;
			case TYPE_ADVISOR: this._moves_advisor(x, y, side, result); break;
			case TYPE_ELEPHANT: this._moves_elephant(x, y, side, result); break;
			case TYPE_HORSE: this._moves_horse(x, y, side, result); break;
			case TYPE_CHARIOT: this._moves_chariot(x, y, side, result); break;
			case TYPE_CANNON: this._moves_cannon(x, y, side, result); break;
			case TYPE_SOLDIER: this._moves_soldier(x, y, side, result); break;
		}
		return result;
	}

	_moves_general(x, y, side, moves) {
		const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
		for (const dir of dirs) {
			const nx = x + dir.x;
			const ny = y + dir.y;
			if (!this.is_in_palace(nx, ny, side)) continue;
			const target = this.get_piece_at(nx, ny);
			if (target === null || target.side !== side) {
				moves.push({ x: nx, y: ny });
			}
		}
		const dy = side === BLACK ? 1 : -1;
		let yy = y + dy;
		while (this.is_on_board(x, yy)) {
			const blocker = this.get_piece_at(x, yy);
			if (blocker !== null) {
				if (blocker.side !== side && blocker.type === TYPE_GENERAL) {
					moves.push({ x, y: yy });
				}
				break;
			}
			yy += dy;
		}
	}

	_moves_advisor(x, y, side, moves) {
		const dirs = [{ x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }];
		for (const dir of dirs) {
			const nx = x + dir.x;
			const ny = y + dir.y;
			if (!this._is_advisor_spot(side, nx, ny)) continue;
			const target = this.get_piece_at(nx, ny);
			if (target === null || target.side !== side) {
				moves.push({ x: nx, y: ny });
			}
		}
	}

	_moves_elephant(x, y, side, moves) {
		for (const dx of [-2, 2]) {
			for (const dy of [-2, 2]) {
				const nx = x + dx;
				const ny = y + dy;
				if (!this._is_elephant_spot(side, nx, ny)) continue;
				if (this.get_piece_at(x + dx / 2, y + dy / 2) !== null) continue;
				const target = this.get_piece_at(nx, ny);
				if (target === null || target.side !== side) {
					moves.push({ x: nx, y: ny });
				}
			}
		}
	}

	_moves_horse(x, y, side, moves) {
		for (const step of HORSE_STEPS) {
			const nx = x + step.x;
			const ny = y + step.y;
			if (!this.is_on_board(nx, ny)) continue;
			let leg;
			if (Math.abs(step.x) === 2) {
				leg = { x: x + step.x / 2, y };
			} else {
				leg = { x, y: y + step.y / 2 };
			}
			if (this.get_piece_at(leg.x, leg.y) !== null) continue;
			const target = this.get_piece_at(nx, ny);
			if (target === null || target.side !== side) {
				moves.push({ x: nx, y: ny });
			}
		}
	}

	_moves_chariot(x, y, side, moves) {
		const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
		for (const dir of dirs) {
			let nx = x + dir.x;
			let ny = y + dir.y;
			while (this.is_on_board(nx, ny)) {
				const target = this.get_piece_at(nx, ny);
				if (target === null) {
					moves.push({ x: nx, y: ny });
				} else {
					if (target.side !== side) {
						moves.push({ x: nx, y: ny });
					}
					break;
				}
				nx += dir.x;
				ny += dir.y;
			}
		}
	}

	_moves_cannon(x, y, side, moves) {
		const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
		for (const dir of dirs) {
			let nx = x + dir.x;
			let ny = y + dir.y;
			let screen = false;
			while (this.is_on_board(nx, ny)) {
				const target = this.get_piece_at(nx, ny);
				if (target === null) {
					if (!screen) {
						moves.push({ x: nx, y: ny });
					}
				} else {
					if (!screen) {
						screen = true;
					} else {
						if (target.side !== side) {
							moves.push({ x: nx, y: ny });
						}
						break;
					}
				}
				nx += dir.x;
				ny += dir.y;
			}
		}
	}

	_moves_soldier(x, y, side, moves) {
		const dir = side === BLACK ? 1 : -1;
		const crossed = (side === BLACK && y >= 5) || (side === RED && y <= 4);
		const ny = y + dir;
		if (this.is_on_board(x, ny)) {
			const target = this.get_piece_at(x, ny);
			if (target === null || target.side !== side) {
				moves.push({ x, y: ny });
			}
		}
		if (crossed) {
			for (const dx of [-1, 1]) {
				const nx = x + dx;
				if (!this.is_on_board(nx, y)) continue;
				const target = this.get_piece_at(nx, y);
				if (target === null || target.side !== side) {
					moves.push({ x: nx, y });
				}
			}
		}
	}

	_apply_pseudo(fx, fy, to) {
		const captured = this.board[to.y][to.x];
		this.board[to.y][to.x] = this.board[fy][fx];
		this.board[fy][fx] = null;
		return captured;
	}

	_revert_pseudo(fx, fy, to, captured) {
		this.board[fy][fx] = this.board[to.y][to.x];
		this.board[to.y][to.x] = captured;
	}

	_find_general(side) {
		for (let y = 0; y < ROWS; y++) {
			for (let x = 0; x < COLUMNS; x++) {
				const p = this.board[y][x];
				if (p && p.side === side && p.type === TYPE_GENERAL) {
					return { x, y };
				}
			}
		}
		return { x: -1, y: -1 };
	}

	_in_check(side) {
		const g = this._find_general(side);
		if (g.x < 0) return false;
		const enemy = side === RED ? BLACK : RED;
		const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
		for (const dir of dirs) {
			let nx = g.x + dir.x;
			let ny = g.y + dir.y;
			while (this.is_on_board(nx, ny)) {
				const p = this.board[ny][nx];
				if (p !== null) {
					if (p.side === enemy && (p.type === TYPE_CHARIOT || p.type === TYPE_GENERAL)) {
						return true;
					}
					break;
				}
				nx += dir.x;
				ny += dir.y;
			}
		}
		for (const dir of dirs) {
			let nx = g.x + dir.x;
			let ny = g.y + dir.y;
			let screen = false;
			while (this.is_on_board(nx, ny)) {
				const p = this.board[ny][nx];
				if (p !== null) {
					if (!screen) {
						screen = true;
					} else {
						if (p.side === enemy && p.type === TYPE_CANNON) {
							return true;
						}
						break;
					}
				}
				nx += dir.x;
				ny += dir.y;
			}
		}
		for (const step of HORSE_STEPS) {
			const nx = g.x + step.x;
			const ny = g.y + step.y;
			if (!this.is_on_board(nx, ny)) continue;
			const p = this.board[ny][nx];
			if (!p || p.side !== enemy || p.type !== TYPE_HORSE) continue;
			let leg;
			if (Math.abs(step.x) === 2) {
				leg = { x: nx - step.x / 2, y: ny };
			} else {
				leg = { x: nx, y: ny - step.y / 2 };
			}
			if (this.board[leg.y][leg.x] === null) {
				return true;
			}
		}
		const enemy_dir = enemy === BLACK ? 1 : -1;
		const cand1 = { x: g.x, y: g.y - enemy_dir };
		const cand2 = { x: g.x - 1, y: g.y };
		const cand3 = { x: g.x + 1, y: g.y };
		for (const cand of [cand1, cand2, cand3]) {
			if (!this.is_on_board(cand.x, cand.y)) continue;
			const p = this.board[cand.y][cand.x];
			if (!p || p.side !== enemy || p.type !== TYPE_SOLDIER) continue;
			if (cand.y === g.y - enemy_dir) {
				return true;
			}
			const crossed = (enemy === BLACK && cand.y >= 5) || (enemy === RED && cand.y <= 4);
			if (crossed) {
				return true;
			}
		}
		return false;
	}

	_get_legal_moves_for_piece(x, y) {
		const result = [];
		const piece = this.get_piece_at(x, y);
		if (!piece) return result;
		const pseudo = this._get_pseudo_moves(x, y);
		for (const mv of pseudo) {
			const captured = this._apply_pseudo(x, y, mv);
			if (!this._in_check(piece.side)) {
				result.push(mv);
			}
			this._revert_pseudo(x, y, mv, captured);
		}
		return result;
	}

	_gen_legal_moves(side) {
		const s = side || this.current_turn;
		const moves = [];
		for (let y = 0; y < ROWS; y++) {
			for (let x = 0; x < COLUMNS; x++) {
				const p = this.board[y][x];
				if (p && p.side === s) {
					const legals = this._get_legal_moves_for_piece(x, y);
					for (const to of legals) {
						moves.push({
							from: { x, y },
							to,
							captured: this.board[to.y][to.x],
							piece: p,
						});
					}
				}
			}
		}
		return moves;
	}

	_move_is_legal(move, side) {
		const s = side || this.current_turn;
		const piece = this.get_piece_at(move.from.x, move.from.y);
		if (!piece || piece.side !== s) return false;
		const legals = this._get_legal_moves_for_piece(move.from.x, move.from.y);
		for (const m of legals) {
			if (m.x === move.to.x && m.y === move.to.y) return true;
		}
		return false;
	}

	_has_any_legal_move(side) {
		for (let y = 0; y < ROWS; y++) {
			for (let x = 0; x < COLUMNS; x++) {
				const p = this.board[y][x];
				if (p && p.side === side) {
					if (this._get_legal_moves_for_piece(x, y).length > 0) {
						return true;
					}
				}
			}
		}
		return false;
	}

	_restore_root_board() {
		this.board = this._clone_board(this.root_node.initial_board);
	}

	_apply_node(node) {
		this.board[node.to.y][node.to.x] = node.piece;
		this.board[node.from.y][node.from.x] = null;
		this.current_node = node;
		const depth = node.getDepth();
		this.current_turn = depth % 2 === 0 ? RED : BLACK;
		this.winner = node.winner;
	}

	_unapply_node(node) {
		this.board[node.from.y][node.from.x] = node.piece;
		this.board[node.to.y][node.to.x] = node.captured;
		this.current_node = node._parent;
		const depth = node._parent ? node._parent.getDepth() : 0;
		this.current_turn = depth % 2 === 0 ? RED : BLACK;
		this.winner = null;
	}

	_play_move_core(from, to, opts) {
		const options = opts || {};
		if (this.winner !== null) return false;
		const piece = this.get_piece_at(from.x, from.y);
		if (!piece || piece.side !== this.current_turn) return false;
		const legals = this._get_legal_moves_for_piece(from.x, from.y);
		let found = false;
		for (const m of legals) {
			if (m.x === to.x && m.y === to.y) { found = true; break; }
		}
		if (!found) return false;

		const children = this.current_node.getChildren();
		for (const child of children) {
			if (child.from.x === from.x && child.from.y === from.y &&
				child.to.x === to.x && child.to.y === to.y) {
				this._apply_node(child);
				return true;
			}
		}

		const node = new MoveNode();
		node.from = { x: from.x, y: from.y };
		node.to = { x: to.x, y: to.y };
		node.piece = piece;
		node.captured = this.board[to.y][to.x];
		node.moveText = options.move_text || '';
		this.current_node.addChild(node);

		this.board[to.y][to.x] = piece;
		this.board[from.y][from.x] = null;
		this.current_node = node;
		this.current_turn = piece.side === RED ? BLACK : RED;

		if (node.captured && node.captured.type === TYPE_GENERAL) {
			node.winner = piece.side;
		} else {
			const next_side = piece.side === RED ? BLACK : RED;
			if (!this._has_any_legal_move(next_side)) {
				node.winner = piece.side;
			}
		}
		this.winner = node.winner;
		return true;
	}

	make_move(move, opts) {
		const options = opts || {};
		const update_tree = options.update_tree !== false;
		if (!update_tree) {
			this.board_stack.push({
				board: this._clone_board(this.board),
				current_turn: this.current_turn,
				winner: this.winner,
			});
			const ok = this._move_is_legal(move, this.current_turn);
			if (!ok) {
				this.board_stack.pop();
				return false;
			}
			const piece = this.board[move.from.y][move.from.x];
			this.board[move.to.y][move.to.x] = piece;
			this.board[move.from.y][move.from.x] = null;
			if (this._in_check(piece.side)) {
				const saved = this.board_stack.pop();
				this.board = saved.board;
				this.current_turn = saved.current_turn;
				this.winner = saved.winner;
				return false;
			}
			this.current_turn = piece.side === RED ? BLACK : RED;
			this._emit_position_changed();
			return true;
		}

		const ok = this._play_move_core(move.from, move.to, opts);
		if (!ok) return false;
		this._emit_position_changed();
		return true;
	}

	undo_move() {
		if (!this.current_node._parent) return false;
		this._unapply_node(this.current_node);
		this._emit_position_changed();
		return true;
	}

	redo_move() {
		const children = this.current_node.getChildren();
		if (children.length === 0) return false;
		this._apply_node(children[0]);
		this._emit_position_changed();
		return true;
	}

	goto_node(node) {
		if (!node) return false;
		if (node === this.root_node) {
			this._restore_root_board();
			this.current_node = this.root_node;
			this.current_turn = RED;
			this.winner = null;
			this._emit_position_changed();
			return true;
		}
		const chain = [];
		let cur = node;
		while (cur && cur !== this.root_node) {
			chain.push(cur);
			cur = cur._parent;
		}
		if (cur !== this.root_node) return false;
		chain.reverse();
		this._restore_root_board();
		this.current_node = this.root_node;
		for (const n of chain) {
			this._apply_node(n);
		}
		this._emit_position_changed();
		return true;
	}

	switch_variation(dir) {
		const parent = this.current_node._parent;
		if (!parent) return false;
		const siblings = parent.getChildren();
		if (siblings.length <= 1) return false;
		let idx = siblings.indexOf(this.current_node);
		if (idx < 0) return false;
		idx = (idx + dir + siblings.length) % siblings.length;
		return this.goto_node(siblings[idx]);
	}

	add_comment(text) {
		if (this.current_node) {
			this.current_node.comment = (this.current_node.comment || '') + text;
		}
	}

	clear_comment() {
		if (this.current_node) {
			this.current_node.comment = '';
		}
	}

	reset_from_fen(fen_str) {
		const rows = fen_str.trim().split(' ')[0].split('/');
		if (rows.length !== ROWS) return false;
		this._clear_board();
		for (let y = 0; y < ROWS; y++) {
			const row = rows[y];
			let x = 0;
			for (let i = 0; i < row.length; i++) {
				const ch = row[i];
				if (ch >= '0' && ch <= '9') {
					x += parseInt(ch, 10);
					continue;
				}
				const piece = Piece.fromChar(ch);
				if (!piece) return false;
				if (x >= COLUMNS) return false;
				this.board[y][x] = piece;
				x++;
			}
			if (x !== COLUMNS) return false;
		}
		this._build_root_tree();
		this.winner = null;
		this.current_turn = RED;
		this.board_stack = [];
		this._emit_position_changed();
		return true;
	}

	to_fen() {
		return this.get_fen_notation(this.board);
	}

	get_setup_fen() {
		const src = (this.root_node && this.root_node.initial_board) ? this.root_node.initial_board : this.board;
		return this.get_fen_notation(src, /*forceRed*/ true, /*depthOverride*/ 0);
	}

	get_fen_notation(src, forceRed, depthOverride) {
		if (!src) src = this.board;
		const parts = [];
		for (let y = 0; y < ROWS; y++) {
			let run = 0;
			let line = '';
			for (let x = 0; x < COLUMNS; x++) {
				const p = src[y][x];
				if (p === null) {
					run++;
				} else {
					if (run > 0) {
						line += run;
						run = 0;
					}
					line += Piece.toChar(p);
				}
			}
			if (run > 0) line += run;
			parts.push(line);
		}
		const turn = forceRed ? RED : this.current_turn;
		const turnChar = (turn === RED) ? 'w' : 'b';
		const depth = (typeof depthOverride === 'number') ? depthOverride
			: (this.current_node ? this.current_node.getDepth() : 0);
		const fullmove = Math.floor(depth / 2) + 1;
		return parts.join('/') + ' ' + turnChar + ' - - 0 ' + fullmove;
	}

	_col_num(side, x) {
		if (side === RED) {
			return CN_NUMS[9 - x];
		} else {
			return String(x + 1);
		}
	}

	_move_text(move) {
		const piece = move.piece;
		if (!piece) return '';
		const side = piece.side;
		const name = TYPE_CHARS[piece.type][side === RED ? 0 : 1];
		const from_x = move.from.x;
		const to_x = move.to.x;
		const from_y = move.from.y;
		const to_y = move.to.y;
		const forward_dir = side === BLACK ? 1 : -1;
		let action;
		let num;
		if (to_y === from_y) {
			action = '平';
			num = this._col_num(side, to_x);
		} else if ((to_y - from_y) * forward_dir > 0) {
			action = '进';
			if (piece.type === TYPE_HORSE || piece.type === TYPE_ELEPHANT || piece.type === TYPE_ADVISOR) {
				num = this._col_num(side, to_x);
			} else {
				const steps = Math.abs(to_y - from_y);
				num = side === RED ? CN_NUMS[steps] : String(steps);
			}
		} else {
			action = '退';
			if (piece.type === TYPE_HORSE || piece.type === TYPE_ELEPHANT || piece.type === TYPE_ADVISOR) {
				num = this._col_num(side, to_x);
			} else {
				const steps = Math.abs(to_y - from_y);
				num = side === RED ? CN_NUMS[steps] : String(steps);
			}
		}
		return name + this._col_num(side, from_x) + action + num;
	}

	export_pgn() {
		const d = new Date();
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		const dateStr = `${y}.${m}.${day}`;
		const lines = [
			'[Event "日常对局"]',
			'[Site "-"]',
			`[Date "${dateStr}"]`,
			'[Round "-"]',
			'[Red "-"]',
			'[Black "-"]',
			'[Result "*"]',
			`[FEN "${this.get_setup_fen()}"]`,
			'',
		];
		const buf = [];
		if (this.root_node.hasChildren()) {
			this._append_pgn_node(this.root_node.getChildren()[0], 1, buf);
			const children = this.root_node.getChildren();
			for (let i = 1; i < children.length; i++) {
				this._append_pgn_variation(children[i], 1, buf);
			}
		}
		lines.push(buf.join(' '));
		return lines.join('\n') + '\n';
	}

	_append_pgn_node(node, depth, buf) {
		const label = this._move_text({
			piece: node.piece,
			from: node.from,
			to: node.to,
		});
		const moveNum = Math.ceil(depth / 2);
		if (depth % 2 === 1) {
			buf.push(`${moveNum}. ${label}`);
		} else {
			buf.push(label);
		}
		if (node.comment) {
			buf.push(`{${node.comment}}`);
		}
		const children = node.getChildren();
		for (let i = 1; i < children.length; i++) {
			this._append_pgn_variation(children[i], depth + 1, buf);
		}
		if (children.length > 0) {
			this._append_pgn_node(children[0], depth + 1, buf);
		}
	}

	_append_pgn_variation(node, depth, buf) {
		const label = this._move_text({
			piece: node.piece,
			from: node.from,
			to: node.to,
		});
		buf.push('(');
		const moveNum = Math.ceil(depth / 2);
		if (depth % 2 === 1) {
			buf.push(`${moveNum}. ${label}`);
		} else {
			buf.push(`${moveNum}... ${label}`);
		}
		if (node.comment) {
			buf.push(`{${node.comment}}`);
		}
		const children = node.getChildren();
		for (let i = 1; i < children.length; i++) {
			this._append_pgn_variation(children[i], depth + 1, buf);
		}
		if (children.length > 0) {
			this._append_pgn_node(children[0], depth + 1, buf);
		}
		buf.push(')');
	}

	_extract_pgn_header(text, key) {
		const re = new RegExp(`\\[${key} "([^"]*)"\\]`);
		const m = text.match(re);
		return m ? m[1] : '';
	}

	_pgn_tokens(text) {
		const tokens = [];
		const re = /[(){}]|[a-i][0-9]-[a-i][0-9]|(?:[零一二三四五六七八九]+[0-9]?[将帅仕士相象马车炮兵卒][一二三四五六七八九123456789]?[进退平][一二三四五六七八九123456789])/g;
		const moveRe = /^[a-i][0-9]-[a-i][0-9]$/;
		const commentRe = /\{([^}]*)\}/g;
		let commentMatch;
		const comments = {};
		let textNoComment = text;
		while ((commentMatch = commentRe.exec(text)) !== null) {
			const idx = commentMatch.index;
			comments[idx] = commentMatch[1];
			textNoComment = textNoComment.slice(0, commentMatch.index) + ' '.repeat(commentMatch[0].length) + textNoComment.slice(commentMatch.index + commentMatch[0].length);
		}
		const lines = textNoComment.split('\n');
		let globalIdx = 0;
		for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
			const line = lines[lineIdx];
			if (line.startsWith('[')) {
				globalIdx += line.length + 1;
				continue;
			}
			let i = 0;
			while (i < line.length) {
				const ch = line[i];
				if (ch === '(' || ch === ')') {
					tokens.push(ch);
					i++;
					globalIdx++;
					continue;
				}
				if (ch === '{') {
					let j = i + 1;
					let c = '';
					while (j < line.length && line[j] !== '}') { c += line[j]; j++; }
					tokens.push({ comment: c });
					i = j + 1;
					globalIdx += (j - i + 1);
					continue;
				}
				if (ch === ' ' || ch === '\t' || (ch >= '0' && ch <= '9') || ch === '.') {
					i++;
					globalIdx++;
					continue;
				}
				if (ch >= 'a' && ch <= 'i') {
					const substr = line.substr(i, 7);
					const mm = substr.match(/^([a-i])([0-9])-([a-i])([0-9])/);
					if (mm) {
						tokens.push({
							from: { x: mm[1].charCodeAt(0) - 97, y: parseInt(mm[2], 10) },
							to: { x: mm[3].charCodeAt(0) - 97, y: parseInt(mm[4], 10) },
						});
						i += 7;
						globalIdx += 7;
						continue;
					}
				}
				const cnMatch = line.substr(i).match(/^([将帅仕士相象马车炮兵卒])([一二三四五六七八九123456789])([进退平])([一二三四五六七八九123456789])/);
				if (cnMatch) {
					tokens.push({ cn: [cnMatch[1], cnMatch[2], cnMatch[3], cnMatch[4]] });
					i += cnMatch[0].length;
					globalIdx += cnMatch[0].length;
					continue;
				}
				i++;
				globalIdx++;
			}
			globalIdx += 1;
		}
		return tokens;
	}

	_cn_char_to_type(ch, side) {
		for (const t of Object.keys(TYPE_CHARS)) {
			if (TYPE_CHARS[t][side === RED ? 0 : 1] === ch) return t;
		}
		return null;
	}

	_cn_num_to_int(s) {
		if (/^[0-9]+$/.test(s)) return parseInt(s, 10);
		const map = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '零': 0 };
		if (map[s] !== undefined) return map[s];
		return 0;
	}

	_x_from_col(side, colStr) {
		const n = this._cn_num_to_int(colStr);
		if (side === RED) {
			return 9 - n;
		} else {
			return n - 1;
		}
	}

	_resolve_cn_move(tok) {
		const [name, fromColStr, action, paramStr] = tok.cn;
		const side = this.current_turn;
		const type = this._cn_char_to_type(name, side);
		if (!type) return null;
		const fromX = this._x_from_col(side, fromColStr);
		let fromY = -1;
		for (let y = 0; y < ROWS; y++) {
			const p = this.board[y][fromX];
			if (p && p.side === side && p.type === type) {
				const legals = this._get_legal_moves_for_piece(fromX, y);
				for (const l of legals) {
					const match = this._match_cn_action(side, type, { x: fromX, y }, l, action, paramStr);
					if (match) {
						return { from: { x: fromX, y }, to: l };
					}
				}
				fromY = y;
			}
		}
		return null;
	}

	_match_cn_action(side, type, from, to, action, paramStr) {
		const forward_dir = side === BLACK ? 1 : -1;
		const param = this._cn_num_to_int(paramStr);
		if (action === '平') {
			const targetX = this._x_from_col(side, paramStr);
			return to.y === from.y && to.x === targetX;
		}
		const goingForward = ((to.y - from.y) * forward_dir) > 0;
		if ((action === '进' && !goingForward) || (action === '退' && goingForward)) {
			return false;
		}
		if (type === TYPE_HORSE || type === TYPE_ELEPHANT || type === TYPE_ADVISOR) {
			const targetX = this._x_from_col(side, paramStr);
			return to.x === targetX;
		} else {
			const steps = Math.abs(to.y - from.y);
			return steps === param;
		}
	}

	import_pgn(pgn_str) {
		const fen = this._extract_pgn_header(pgn_str, 'FEN');
		if (fen) {
			if (!this.reset_from_fen(fen)) return false;
		} else {
			this.reset_board();
		}
		const tokens = this._pgn_tokens(pgn_str);
		this._parse_cursor = 0;
		this._parse_anchors = [];
		if (!this._parse_pgn_sequence(tokens)) return false;
		this._emit_position_changed();
		return true;
	}

	_parse_pgn_sequence(tokens) {
		while (this._parse_cursor < tokens.length) {
			const t = tokens[this._parse_cursor];
			if (typeof t === 'string') {
				if (t === ')') {
					this._parse_cursor++;
					if (this._parse_anchors.length > 0) {
						const anchor = this._parse_anchors.pop();
						if (!this.goto_node(anchor)) return false;
					}
					return true;
				}
				if (t === '(') {
					this._parse_cursor++;
					this._parse_anchors.push(this.current_node);
					if (!this._parse_pgn_sequence(tokens)) return false;
					continue;
				}
				this._parse_cursor++;
				continue;
			}
			if (t && t.comment !== undefined) {
				this.add_comment(t.comment);
				this._parse_cursor++;
				continue;
			}
			this._parse_cursor++;
			let from, to;
			if (t.from && t.to) {
				from = t.from;
				to = t.to;
			} else if (t.cn) {
				const mv = this._resolve_cn_move(t);
				if (!mv) return false;
				from = mv.from;
				to = mv.to;
			} else {
				continue;
			}
			if (!this._parse_pgn_move(from, to)) return false;
		}
		return true;
	}

	_path_depth_from(node) {
		let d = 0;
		let n = node;
		while (n && n !== this.root_node) {
			d++;
			n = n._parent;
		}
		return d;
	}

	_parse_pgn_move(from, to) {
		const piece = this.get_piece_at(from.x, from.y);
		if (!piece) return false;
		if (this._parse_anchors.length > 0 && piece.side !== this.current_turn) {
			let mount = this.current_node;
			while (mount) {
				const d = this._path_depth_from(mount);
				if ((d % 2 === 0) === (piece.side === RED)) {
					break;
				}
				mount = mount._parent;
			}
			if (!mount) return false;
			if (!this.goto_node(mount)) return false;
		}
		return this._play_move_core(from, to);
	}
}

export { Piece, MoveNode, XiangqiGame };
