#!/usr/bin/env python3
"""
Search for skills on skills.sh
Usage: python search-skills.py <query>
"""

import sys
import urllib.request
import urllib.parse
import json
import re
from html.parser import HTMLParser

class SkillsParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skills = []
        self.current_skill = {}
        self.in_skill = False
        self.in_title = False
        self.in_desc = False
        self.in_stats = False

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == 'a' and 'href' in attrs_dict:
            href = attrs_dict['href']
            if href.startswith('/skills/'):
                self.in_skill = True
                self.current_skill = {'url': f"https://skills.sh{href}"}

    def handle_data(self, data):
        data = data.strip()
        if not data:
            return
        if self.in_skill and data:
            if 'name' not in self.current_skill:
                self.current_skill['name'] = data
            elif 'description' not in self.current_skill:
                self.current_skill['description'] = data

    def handle_endtag(self, tag):
        if tag == 'a' and self.in_skill:
            if 'name' in self.current_skill:
                self.skills.append(self.current_skill)
            self.in_skill = False
            self.current_skill = {}

def search_skills(query: str) -> list:
    """Search skills.sh for matching skills."""
    url = f"https://skills.sh/search?q={urllib.parse.quote(query)}"

    try:
        req = urllib.request.Request(
            url,
            headers={'User-Agent': 'skill-generator/1.0'}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            html = response.read().decode('utf-8')

        parser = SkillsParser()
        parser.feed(html)
        return parser.skills[:10]  # Return top 10

    except Exception as e:
        print(f"Error searching: {e}", file=sys.stderr)
        return []

def main():
    if len(sys.argv) < 2:
        print("Usage: python search-skills.py <query>")
        print("Example: python search-skills.py 'react best practices'")
        sys.exit(1)

    query = ' '.join(sys.argv[1:])
    print(f"Searching skills.sh for: {query}\n")

    skills = search_skills(query)

    if not skills:
        print("No skills found. Try a different query.")
        print("\nAlternative: Visit https://skills.sh directly")
        sys.exit(0)

    print(f"Found {len(skills)} skills:\n")

    for i, skill in enumerate(skills, 1):
        print(f"{i}. {skill.get('name', 'Unknown')}")
        if 'description' in skill:
            print(f"   {skill['description'][:100]}...")
        print(f"   URL: {skill.get('url', 'N/A')}")
        print()

    print("\nTo install a skill:")
    print("  npx skills add <owner/repo>")
    print("  (tip: use --agent <name> to install for a specific agent)")

if __name__ == '__main__':
    main()
