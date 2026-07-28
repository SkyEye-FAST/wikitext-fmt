# Changelog

## Unreleased

- Inherit final full-document equivalence and structured failure reporting from
  the core safe formatter.
- Expose distinct production and aggressive profiles: production contains
  graduated structural rules, while aggressive adds still-validating rules.
- Enable graduated parser-assisted table formatting by default.
- Use unified complex-template formatting and structural-equivalence safety from
  the core package.
- Preserve anonymous template arguments and table cell whitespace exactly via
  the strengthened core structural safety checks.

## 0.1.0

- Initial VS Code formatter wrapper.
- Format Document support for wikitext and compatible mediawiki language ids.
- Bundled wikitext-fmt runtime.
- Safe formatting by default.
- Workspace configuration file discovery.
- Experimental formatter options exposed via settings.
