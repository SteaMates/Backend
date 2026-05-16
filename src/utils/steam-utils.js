/**
 * Nombre del fichero: steam-utils.js
 * Descripción: Utilidades compartidas por los módulos de rutas de Steam.
 * Autor: Adrián Artigas Subiras, Adrián Becerril Granada, Pablo Nicolás Fabra Roque, Enrique Baldovin Cotela, Adrián Nasarre
 */

export const STEAM_API_BASE = "https://api.steampowered.com";

/**
 * Devuelve la API key de Steam o null si no está configurada.
 */
export function getSteamApiKey() {
  const key = process.env.STEAM_API_KEY;
  if (!key || key === "your_steam_api_key_here") return null;
  return key;
}

/**
 * Devuelve la API key de IsThereAnyDeal o null si no está configurada.
 */
export function getItadApiKey() {
  const key = process.env.ITAD_API_KEY || process.env.ISTHEREANYDEAL_API_KEY;
  if (!key || key === "your_itad_api_key_here") return null;
  return key;
}

/**
 * Obtiene la lista de juegos de un usuario de Steam.
 * Devuelve [] si la API key no está configurada o la biblioteca es privada.
 */
export async function fetchOwnedGames(steamId) {
  const apiKey = getSteamApiKey();
  if (!apiKey) return [];

  const response = await fetch(
    `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v0001/?key=${apiKey}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&format=json`,
  );
  const data = await response.json();
  return data.response?.games || [];
}
