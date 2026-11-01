// আসল গেম বানানো হলে প্রতিটির path বদলাও

export const GAMES = [
  {
    id: "color-match",
    name: "রঙ মিলান",
    category: "পাজল",
    path: "games/demo/index.html"
  },
  {
    id: "speed-tap",
    name: "দ্রুত ট্যাপ",
    category: "আর্কেড",
    path: "games/demo/index.html"
  },
  {
    id: "memory-card",
    name: "মেমোরি কার্ড",
    category: "পাজল",
    path: "games/demo/index.html"
  },
  {
    id: "puzzle-time",
    name: "পাজল টাইম",
    category: "পাজল",
    path: "games/demo/index.html"
  },
  {
    id: "space-run",
    name: "স্পেস রান",
    category: "অ্যাকশন",
    path: "games/demo/index.html"
  },
  {
    id: "fruit-slice",
    name: "ফল কাটুন",
    category: "ক্যাজুয়াল",
    path: "games/demo/index.html"
  },
  {
    id: "ball-bounce",
    name: "বল বাউন্স",
    category: "আর্কেড",
    path: "games/demo/index.html"
  },
  {
    id: "match-three",
    name: "ম্যাচ থ্রি",
    category: "পাজল",
    path: "games/demo/index.html"
  },
  {
    id: "mini-football",
    name: "মিনি ফুটবল",
    category: "ক্যাজুয়াল",
    path: "games/demo/index.html"
  }
];

export function getGameById(id) {
  return GAMES.find(g => g.id === id) || null;
}
