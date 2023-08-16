> **Note**
> As the creator mentioned below, the plugin is no longer maintained. Check out an [alternative implementation](https://github.com/ivan-lednev/better-search-views)

> **Warning**
> I'm sad to say I can't find the time to maintain this plug-in. As such, issues will not be read. I may merge pull requests from time to time. If you think you can maintain this plugin please contact me.
> 
![Obsidian Influx logo](https://user-images.githubusercontent.com/6455628/178807529-785b29cd-b1d7-4586-99de-5b4411d8fd17.png)

![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/jensmtg/influx?style=for-the-badge&sort=semver)

Similar to the *backlinks* core plugin for [Obsidian](https://obsidian.md/), but made to display relevant and formatted excerpts from notes with linked mentions, based on the position of mentions in the notes' hierarchical structure (bullet level indentation).

![screencap](https://user-images.githubusercontent.com/6455628/196566154-404086ad-9a6c-49b0-bb5c-f7335090e2fb.png)

### Suggested usage pattern: 
(Or: How to get the most out of this plugin.)

* Information should mainly be written in daily (or Zettelkasten-ish) notes. Topical notes will then mainly be aggregates of clippings from daily notes.
* Notes should be taken hierarchically, in the form of bullet lists/*bullet journaling*. This helps keep clippings terse and relevant.
* Links should be used as the only organizing principle in the vault - forgo use of tags and files/folders. This helps with completeness; the plugin only considers links when aggregating.

### Release notes

#### 02.02.23

The focus of this update has been to reimplement part of the core of the Influx plugin; the functions that generate the excerpts. The new implementation is more robust, more correct(!) and also has an extensive test coverage, which makes it easier to maintain and make changes to features without breaking other features. Here are the main features of the new update, in terms of functionality:

* A lot of things should generally just work better. Like: Nested callouts, ordered lists, different indentation levels in general, tables and LaTex-formatted blocks.
* The issue where text appears below the Influx-component when typing has gotten a workaround fix, by hiding Influx while typing.
* Influx in reading mode is enabled.

Thanks to kenlim for contributing to development through a pull request!

Thanks to ericlpeterson, alranel, FilSalustri, Josh2K, mrkuramoto and Mat4m0 for sponsoring, and supporting ongoing maintainance!


