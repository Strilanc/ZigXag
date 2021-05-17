/**
 * @param {!string} text_diagram
 * @param {!function(!string): TNodeData} node_data_parser
 * @returns {!{nodes: !Array.<TNodeData>, edges: !Array.<[!int, !int]>}}
 * @template TNodeData
 */
function text_diagram_to_edge_list(text_diagram, node_data_parser= e => e) {
    let char_map = _text_to_char_map(text_diagram);
    let {node_ids, nodes} = _find_nodes(char_map, node_data_parser);
    let edges = _find_all_edges(char_map, node_ids);
    return {nodes, edges};
}

/**
 * @param {!string} text
 * @returns {!Map<!string, ![!int, !int, !string]>}
 * @private
 */
function _text_to_char_map(text) {
    let char_map = new Map();
    let x = 0;
    let y = 0;
    for (let c of text) {
        if (c === '\n') {
            x = 0;
            y++;
            continue;
        }
        if (c !== ' ') {
            char_map.set(`${x},${y}`, [x, y, c]);
        }
        x++;
    }
    return char_map;
}

const DIR_TO_CHARS = new Map([
    ['-1,-1', '\\'],
    ['0,-1', '|+'],
    ['1,-1', '/'],
    ['-1,0', '-+'],
    ['1,0', '-+'],
    ['-1,1', '/'],
    ['0,1', '|+'],
    ['1,1', '\\'],
]);
const CHARACTER_TO_DIRECTIONS = new Map([
    ['\\', [[1, 1], [-1, -1]]],
    ['-', [[1, 0], [-1, 0]]],
    ['|', [[0, 1], [0, -1]]],
    ['/', [[-1, 1], [1, -1]]],
    ['+', [[1, 0], [-1, 0], [0, 1], [0, -1]]],
]);

/**
 * @param {!Map<!string, ![!int, !int, !string]>} char_map
 * @param {!Map<!string, K>} terminal_map
 * @returns {!Array.<![K, K]>}
 * @template K
 * @private
 */
function _find_all_edges(char_map, terminal_map) {
    let edges = [];
    for (let [k, [x, y, c]] of char_map.entries()) {
        if (terminal_map.has(k)) {
            continue;
        }
        if (c === '*') {
            continue;
        }
        let dxy_s = CHARACTER_TO_DIRECTIONS.get(c);
        if (dxy_s === undefined) {
            throw new Error(`Character ${x+1} ('${c}') in line ${y+1} isn't part of a node or an edge`);
        }
        for (let [dx, dy] of dxy_s) {
            let x1 = x - dx;
            let y1 = y - dy;
            let n1 = terminal_map.get(`${x1},${y1}`);
            if (n1 !== undefined) {
                let [x2, y2] = _find_end_of_edge(x, y, dx, dy, char_map, terminal_map);
                let n2 = terminal_map.get(`${x2},${y2}`);
                edges.push([n1, n2]);
            }
        }
    }
    for (let e of edges) {
        e.sort((a, b) => a - b);
    }
    edges.sort(([x1, y1], [x2, y2]) => x1 !== x2 ? x1 - x2 : y1 - y2);

    let result = []
    for (let k = 0; k < edges.length; k += 2) {
        let [x1, y1] = edges[k];
        let [x2, y2] = edges[k + 1];
        if (x1 !== x2 || y1 !== y2) {
            throw new Error("Internal implementation error. Edges weren't duped.");
        }
        result.push([x1, y1]);
    }
    return result;
}

/**
 * @param {!int} x
 * @param {!int} y
 * @param {!int} in_dx
 * @param {!int} in_dy
 * @param {!Map<!string, ![!int, !int, !string]>} char_map
 * @returns {![!int, !int]}
 */
function _star_junction_outward_dir(x, y, in_dx, in_dy, char_map) {
    let matches = [];
    for (let out_dx = -1; out_dx <= 1; out_dx++) {
        for (let out_dy = -1; out_dy <= 1; out_dy++) {
            let c2 = (char_map.get(`${x + out_dx},${y + out_dy}`) ?? '   ')[2];
            if ((out_dx !== 0 || out_dy !== 0) && (out_dx !== -in_dx || out_dy !== -in_dy) && DIR_TO_CHARS.get(`${out_dx},${out_dy}`).includes(c2)) {
                matches.push([out_dx, out_dy]);
            }
        }
    }
    if (matches.length !== 1) {
        throw new Error(`Edge junction ('*') at character ${x+1} of line ${y+1} doesn't have degree 2.`);
    }
    return matches[0];
}

/**
 * @param {!int} x
 * @param {!int} y
 * @param {!int} dx
 * @param {!int} dy
 * @param {!Map<!string, ![!int, !int, !string]>} char_map
 * @param {!Map<!string, K>} terminal_map
 * @returns {![!int, !int]}
 * @template K
 * @private
 */
function _find_end_of_edge(x, y, dx, dy, char_map, terminal_map) {
    let s = 1;
    while (true) {
        let continuation_characters = DIR_TO_CHARS.get(`${dx},${dy}`);
        let pk = `${x + dx*s},${y + dy*s}`;
        let c = (char_map.get(pk) ?? '   ')[2];

        if (terminal_map.has(pk)) {
            if (s !== 1) {
                throw new Error(`Hit node before edge crossing finished. Line ${y + 1} col ${x + 1}$.`);
            }
            return [x + dx*s, y + dy*s];
        }

        if (c === '*') {
            if (s !== 1) {
                throw new Error(`Hit junction (*) before edge crossing finished. Line ${y+1} col ${x+1}$.`);
            }
            x += dx;
            y += dy;
            [dx, dy] = _star_junction_outward_dir(x, y, dx, dy, char_map);
            x += dx;
            y += dy;
            s = 1;
            continue;
        }

        if (continuation_characters.includes(c)) {
            x += dx*s;
            y += dy*s;
            s = 1;
            continue;
        }

        if (!CHARACTER_TO_DIRECTIONS.has(c)) {
            throw new Error(`Dangling edge. Line ${y+1} col ${x+1}$.`);
        }

        s += 1;
    }
}

/**
 * @param {!Map.<!string, ![!int, !int, !string]>} char_map
 * @param {!function(!string): TNodeData} node_data_parser
 * @returns {!{node_ids: !Map.<!string, !int>, nodes: !Array.<!ZxType>}}
 * @template TNodeData
 * @private
 */
function _find_nodes(char_map, node_data_parser = e => e) {
    let node_ids = new Map();
    let nodes = [];

    const NODE_CHARS = /^[a-zA-Z0-9()]$/
    let next_node_id = 0;

    for (let [k, [x, y, lead_char]] of char_map.entries()) {
        if (node_ids.has(k)) {
            continue;
        }
        if (!NODE_CHARS.test(lead_char)) {
            continue;
        }

        let n = 0;
        let nested = 0;
        let full_name = '';
        while (true) {
            let xyc = char_map.get(`${x+n},${y}`);
            let c = xyc === undefined ? ' ' : xyc[2];
            if (c === ' ' && nested > 0) {
                throw new Error("Label ended before ')' to go with '(' was found.")
            }
            if (nested === 0 && !NODE_CHARS.test(c)) {
                break;
            }
            full_name += c;
            if (c === '(') {
                nested++;
            } else if (c === ')') {
                nested--;
            }
            n += 1;
        }

        let node_data = node_data_parser(full_name);
        if (node_data === undefined) {
            throw new Error(`Unrecognized node type: '${full_name}'`);
        }

        let id = next_node_id;
        next_node_id++;
        for (let k = 0; k < n; k++) {
            node_ids.set(`${x+k},${y}`, id);
        }
        nodes.push(node_data);
    }

    return {node_ids, nodes};
}

export {_find_nodes, _find_end_of_edge, _find_all_edges, _text_to_char_map, text_diagram_to_edge_list}
