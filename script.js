// Global canvas and context variables
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Configuration constants
const CELL_SIZE = 10;
const CELL_BORDER_RADIUS = 2;
const NEIGHBOR_COLORS = [
    '#9be9a8', // 0-1 neighbor
    '#40c463', // 2 neighbors
    '#30a14e', // 3 neighbors
    '#216e39'  // 4+ neighbors
];
const DEAD_CELL_COLOR = '#161b22';
const SIMULATION_UPDATE_INTERVAL_MS = 500;
const RESIZE_DEBOUNCE_MS = 250;
const INITIAL_LIVE_CELL_RATIO = 0.25; // (1 - 0.75 from original)

// Mutable global state variables
let gridWidth, gridHeight;
let grid; // 2D array representing cell states (0 = dead, 1 = live)
let animationId; // Stores the ID from setInterval for the game loop
let resizeTimeoutId; // Stores the ID from setTimeout for debouncing resize

/**
 * @description Resizes the canvas to fill the window and calculates the
 *              number of cells that fit in the new dimensions.
 * @returns {void}
 */
function resizeCanvasAndGrid() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gridWidth = Math.floor(canvas.width / CELL_SIZE);
    gridHeight = Math.floor(canvas.height / CELL_SIZE);
}

/**
 * @description Initializes the game grid as a 2D array with random live/dead
 *              cells based on INITIAL_LIVE_CELL_RATIO.
 * @returns {void}
 */
function initializeGrid() {
    grid = new Array(gridHeight);
    for (let y = 0; y < gridHeight; y++) {
        grid[y] = new Array(gridWidth);
        for (let x = 0; x < gridWidth; x++) {
            // Math.random() > (1 - 0.25) means Math.random() > 0.75
            grid[y][x] = Math.random() > (1 - INITIAL_LIVE_CELL_RATIO) ? 1 : 0;
        }
    }
}

/**
 * @description Counts the number of live neighbors for a given cell.
 *              This function implements toroidal boundary conditions, meaning the
 *              grid wraps around at the edges. For example, a cell at the top
 *              edge of the grid will consider cells at the bottom edge as its
 *              neighbors, and similarly for the left and right edges.
 * @param {number} x - The x-coordinate (column index) of the cell in the grid.
 *                     Must be an integer from 0 to gridWidth - 1.
 * @param {number} y - The y-coordinate (row index) of the cell in the grid.
 *                     Must be an integer from 0 to gridHeight - 1.
 * @returns {number} The total count of live neighboring cells (0-8).
 * @example
 * // Consider a 3x3 grid:
 * // grid = [
 * //   [1, 0, 1],
 * //   [0, 1, 0],
 * //   [1, 0, 1]
 * // ];
 * // gridWidth = 3, gridHeight = 3;
 *
 * // For cell (0,0) (top-left, value 1):
 * // Neighbors are:
 * // (2,2) (wrap) -> grid[2][2] = 1
 * // (2,0) (wrap) -> grid[2][0] = 1
 * // (2,1) (wrap) -> grid[2][1] = 0
 * // (0,2) (wrap) -> grid[0][2] = 1
 * // (0,1)        -> grid[0][1] = 0
 * // (1,2) (wrap) -> grid[1][2] = 0
 * // (1,0)        -> grid[1][0] = 0
 * // (1,1)        -> grid[1][1] = 1
 * // countLiveNeighbors(0,0) would return 4.
 *
 * // For cell (1,1) (center, value 1):
 * // Neighbors are all adjacent cells:
 * // (0,0), (0,1), (0,2), (1,0), (1,2), (2,0), (2,1), (2,2)
 * // countLiveNeighbors(1,1) would return 4 (sum of surrounding 1s and 0s).
 */
function countLiveNeighbors(x, y) {
    let count = 0;
    for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
            if (i === 0 && j === 0) continue; // Skip the cell itself

            // Apply toroidal wrap-around logic
            // (x + j + gridWidth) ensures the result is non-negative before modulo
            const neighborX = (x + j + gridWidth) % gridWidth;
            // (y + i + gridHeight) ensures the result is non-negative before modulo
            const neighborY = (y + i + gridHeight) % gridHeight;

            count += grid[neighborY][neighborX];
        }
    }
    return count;
}

/**
 * @description Draws the entire grid of cells onto the canvas.
 *              Live cells are colored based on their number of live neighbors.
 *              Dead cells are drawn with DEAD_CELL_COLOR.
 * @returns {void}
 */
function drawGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
            ctx.beginPath();
            const cellXPos = x * CELL_SIZE;
            const cellYPos = y * CELL_SIZE;

            if (ctx.roundRect) {
                ctx.roundRect(
                    cellXPos, cellYPos,
                    CELL_SIZE, CELL_SIZE,
                    [CELL_BORDER_RADIUS]
                );
            } else {
                // Fallback for browsers not supporting roundRect
                ctx.rect(cellXPos, cellYPos, CELL_SIZE, CELL_SIZE);
            }

            if (grid[y][x] === 1) { // If cell is alive
                const liveNeighbors = countLiveNeighbors(x, y);
                // Color based on current number of live neighbors
                if (liveNeighbors <= 1) { 
                    ctx.fillStyle = NEIGHBOR_COLORS[0];
                } else if (liveNeighbors === 2) {
                    ctx.fillStyle = NEIGHBOR_COLORS[1];
                } else if (liveNeighbors === 3) {
                    ctx.fillStyle = NEIGHBOR_COLORS[2];
                } else { // 4 or more neighbors
                    ctx.fillStyle = NEIGHBOR_COLORS[3];
                }
            } else { // If cell is dead
                ctx.fillStyle = DEAD_CELL_COLOR;
            }
            ctx.fill();
        }
    }
}

/**
 * @description Updates the grid state for the next generation based on
 *              Conway's Game of Life rules.
 * @returns {void}
 */
function updateGrid() {
    // Create a deep copy of the grid to base calculations on current state
    const newGrid = grid.map(arr => [...arr]);

    for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
            const liveNeighbors = countLiveNeighbors(x, y);
            const cellIsAlive = grid[y][x] === 1;

            if (cellIsAlive) {
                // Rule 1: Live cell < 2 live neighbors dies (underpopulation).
                // Rule 3: Live cell > 3 live neighbors dies (overpopulation).
                if (liveNeighbors < 2 || liveNeighbors > 3) {
                    newGrid[y][x] = 0; // Cell dies
                }
                // Rule 2: Live cell with 2 or 3 live neighbors lives on.
            } else { // Dead cell
                // Rule 4: Dead cell with 3 live neighbors becomes live (reproduction).
                if (liveNeighbors === 3) {
                    newGrid[y][x] = 1; // Cell becomes alive
                }
            }
        }
    }
    grid = newGrid; // Update the main grid with the new state
}

/**
 * @description Main game loop function. Updates the grid and redraws it.
 * @returns {void}
 */
function gameLoop() {
    updateGrid();
    drawGrid();
}

/**
 * @description Initializes and starts the Game of Life simulation.
 *              Clears any existing simulation interval, sets up the canvas and
 *              grid, draws the initial state, and starts the game loop interval.
 * @returns {void}
 */
function startSimulation() {
    if (animationId) {
        clearInterval(animationId);
    }
    resizeCanvasAndGrid();
    initializeGrid();
    drawGrid(); // Draw initial state immediately
    animationId = setInterval(gameLoop, SIMULATION_UPDATE_INTERVAL_MS);
}

/**
 * @description Handles the window resize event. It debounces the call to
 *              `startSimulation` to prevent frequent restarts during resizing.
 * @returns {void}
 */
function handleResize() {
    clearTimeout(resizeTimeoutId);
    resizeTimeoutId = setTimeout(() => {
        startSimulation(); // Restart simulation with new dimensions
    }, RESIZE_DEBOUNCE_MS);
}

// Event Listeners
window.addEventListener('resize', handleResize);

// Initial Setup
// Ensures the DOM is fully loaded before starting the simulation.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startSimulation);
} else {
    startSimulation();
}
