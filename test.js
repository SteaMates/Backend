require('dotenv').config();
const steamId = '76561198424168032';
const apiKey = process.env.STEAM_API_KEY;
fetch(\https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=\&steamid=\&include_appinfo=1&format=json\)
  .then(r => r.json())
  .then(d => {
      const g = d.response.games || [];
      const topGames = g.sort((a,b)=>b.playtime_forever - a.playtime_forever).slice(0, 5);
      return Promise.all(topGames.map(g => 
        fetch(\https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?key=\&steamid=\&appid=\&l=spanish\)
          .then(r => r.json())
          .then(data => ({
             app: g.name,
             ach: data.playerstats?.achievements?.length || 0,
             success: data.playerstats?.success
          }))
          .catch(e => ({ app: g.name, error: e.message }))
      ));
  })
  .then(res => console.log(JSON.stringify(res, null, 2)))
