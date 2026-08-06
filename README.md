# Hive

A browser implementation of the base [Hive](https://en.wikipedia.org/wiki/Hive_(game)) board game.

## Game modes

- **Pass & play**: two people share one device.
- **Computer**: play White against a tactical computer opponent.
- **Online**: create a five-character room code and send it to another player.

The game enforces the base set's placement and movement rules, including the one-hive rule, freedom to move, Queen placement deadline, Beetle stacking, forced passes, threefold-repetition draws, and all five insect movement patterns.

## Development

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

The Vite development server supports local and computer games. Online rooms use the application server:

```bash
npm run build
npm start
```

Then open `http://localhost:4173`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm test` | Run the rules-engine tests |
| `npm run build` | Create the production client |
| `npm start` | Serve the production client and online rooms |
| `npm run check` | Run tests and create a production build |

Online rooms are held in memory and reset when the server restarts.
