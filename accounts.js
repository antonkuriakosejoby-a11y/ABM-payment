// Accounts. PINs are stored only as SHA-256 hashes of "ABM|<id>|<pin>".
// To change a PIN, generate a new hash (see README.md).
window.ACCOUNTS = [
  {
    id: "abm", name: "ABM Account", phone: null, photo: "images/abm-logo.png",
    company: true,
    pinHash: "4fdd838e10b03a676d64b7f8fced28bf5e703a586e4a67c24684f618cac39dcc",
  },
  {
    id: "joby", name: "Joby Joseph", phone: "9483953160", photo: "images/joby.jpg",
    pinHash: "7484acf5658f93b211d4e2449202993518c7255f6425174905525e1f675c7969",
  },
  {
    id: "anna", name: "Anna Maria", phone: "7259221762", photo: "images/anna.jpg",
    pinHash: "f205c34990a435a860ce55d431f69654eb6fce49ece923d4535a348702e13346",
  },
  {
    id: "asha", name: "Asha Joseph", phone: "9482852939", photo: "images/asha.jpg",
    pinHash: "8f7df2789050bf50c42dfe912031c5543d9b33433e509bdf3a5f918bf7c81302",
  },
  {
    id: "aaron", name: "Aaron Joseph", phone: "776073825", photo: null,
    pinHash: "1d1e0d947a6880f8dbb0c95c1c0be3c4b5ba4de28680dfd02c297aacb6f33133",
  },
];
