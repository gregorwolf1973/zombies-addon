<h1 align="center">🧟 Zombies in Oberbayern</h1>

<p align="center">
  <b>Co-op zombie survival for 2–10 players in the phone browser – game server as a Home Assistant add-on.</b><br>
  A village party in Upper Bavaria turns into a zombie apocalypse. Sneak past, stick together and help each other up.
</p>

<p align="center">
  <a href="https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fgregorwolf1973%2Fzombies-addon"><img src="https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg" alt="Add repository to Home Assistant"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/dynamic/yaml?url=https%3A%2F%2Fraw.githubusercontent.com%2Fgregorwolf1973%2Fzombies-addon%2Fmain%2Fzombies%2Fconfig.yaml&amp;query=%24.version&amp;label=version&amp;color=03a9f4" alt="Version">
  <img src="https://img.shields.io/badge/Home%20Assistant-add--on-41BDF5?logo=homeassistant&amp;logoColor=white" alt="Home Assistant add-on">
  <img src="https://img.shields.io/badge/arch-aarch64%20%7C%20amd64-green" alt="Architectures">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://buymeacoffee.com/gregorwolf1973"><img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-support-FFDD00?logo=buymeacoffee&amp;logoColor=black" alt="Buy me a coffee"></a>
  <a href="https://liberapay.com/Gregor_Wolf/donate"><img src="https://img.shields.io/badge/Liberapay-donate-F6C915?logo=liberapay&amp;logoColor=black" alt="Donate using Liberapay"></a>
</p>

---

> **Early stage (0.x):** multiplayer, safe rooms, inventory, saving, infection and the level-1 gate puzzles work; further levels are still to come.
> The game itself is in German.

## What works today

- Up to 10 players in one shared world; the server is authoritative over movement, zombies and hits
- A procedurally generated village with streets, a market square, houses you can enter (the roof fades away), trees and the Isar river
- Zombies with a visible cone of vision; they hear running and gunshots and find their way around houses
- Sneaking, an automatic pistol for 40 % of the players, shoving for the rest
- Downed players get back up when a teammate stays next to them for 3 seconds
- Dropped connections: your character waits for 2 minutes and you rejoin automatically, even after a page reload
- Four safe rooms with a shared supply chest; barricade the door with planks while zombies wear it down
- Search cupboards, fridges, lockers and car boots (takes time and makes noise); 8-slot backpack
- Water, food, first-aid kits, planks, pistol, baseball bat and ammo; thirst and hunger slowly drop
- Persistent world in SQLite: you can only rest and log out in a safe room – leave outside and you wake up in your last safe room
- Zombie bites can infect you: 90 minutes until you turn (paused in safe rooms) unless someone gives you a rescue syringe – turned players hunt the others for 3 minutes
- Level 1 goal: the village gate has three locks, each opened by a first-aid or preparedness question read from a DokuWiki page; wrong answers make noise
- Dead zombies stay down for a while and can be searched: rarely a pistol, ammo or knife, often clothing, rope, a torch or a chocolate bar
- Optional simulated teammates (`bots` option) that follow you, revive you and look after themselves – handy for testing alone
- Virtual joystick on phones, WASD on desktop; installable as a web app

## Installation

1. Add this repository to Home Assistant (button above).
2. Install **Zombies in Oberbayern** and start it.
3. Open **Zombies** in the sidebar, or let friends join via port **8775**.

If you expose the game to the internet (reverse proxy or Cloudflare Tunnel, WebSockets required), set the
`zugangscode` option – players then need this access code to join.

## Tech

[Colyseus](https://colyseus.io/) 0.18 on Node.js 22 for the server, [Phaser](https://phaser.io/) 3 in the browser.
The map is generated from a seed on both sides, so only the game state travels over the network (20 updates per second).

```sh
cd zombies && npm install && npm test   # 39 tests
npm start                               # http://localhost:2567
```

## License

MIT – see [LICENSE](LICENSE).
