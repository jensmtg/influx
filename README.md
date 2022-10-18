![Obsidian Influx logo](https://user-images.githubusercontent.com/6455628/178807529-785b29cd-b1d7-4586-99de-5b4411d8fd17.png)

![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/jensmtg/influx?style=for-the-badge&sort=semver)

Similar to the *backlinks* core plugin for [Obsidian](https://obsidian.md/), but made to display relevant and formatted excerpts from notes with linked mentions, based on the position of mentions in the notes' hierarchical structure (bullet level indentation).

![screenshot](https://user-images.githubusercontent.com/6455628/195661061-3f1e28d5-4202-4565-873f-d6667422bc86.png)

### Suggested usage pattern: 
(Or: How to get the most out of this plugin.)

* Information should mainly be written in daily (or Zettelkasten-ish) notes. Topical notes will then mainly be aggregates of clippings from daily notes.
* Notes should be taken hierarchically, in the form of bullet lists/*bullet journaling*. This helps keep clippings terse and relevant.
* Links should be used as the only organizing principle in the vault - forgo use of tags and files/folders. This helps with completeness; the plugin only considers links when aggregating.

### Frequently asked questions (FAQ)

* Q: Is it intentional that the plugin is visible in live preview, but not reading view?
  * A: Yes, in the sense that Obsidian currently cannot add widgets to reading view in the same way as live preview (through code mirror extensions.)
* Q; Why can't I see the Influx component in some pages?
  * A: As of version 2, Influx will by default not be shown on pages with no inbound mentions.
