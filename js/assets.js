// Rutas de los archivos pesados (modelos .glb comprimidos e imágenes .webp).
// Se descargan solo cuando hacen falta y el navegador los guarda en caché (ver vercel.json).
// Si cambias un archivo, cámbiale el nombre (o sube ASSET_V) para que los jugadores bajen la versión nueva.
window.ASSET_V = '1';
window.ASSET_URL = path => 'assets/' + path + '?v=' + window.ASSET_V;
window.ENEMY_FILES = ['robot-404', 'robot-entrega-tardia', 'archivo-corrupto', 'coffee-coin', 'empanada-coin'];
window.BG_YAMBORO = ASSET_URL('fondos/yamboro.webp');
window.PORTRAITS = {};
['Diego', 'Wilson', 'Juan', 'Carlos', 'Intructor', 'Jhonny', 'Fabian'].forEach(n => { window.PORTRAITS[n] = ASSET_URL('retratos/' + n + '.webp'); });
