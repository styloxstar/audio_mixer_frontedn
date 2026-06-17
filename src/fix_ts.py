import re
import os

dashboard_path = r'c:\Users\tauru\Downloads\audio_mixer\frontend\src\components\Dashboard.tsx'
with open(dashboard_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix Play unused
content = re.sub(r'Play, ', '', content)
# Fix onOpenPlayer unused
content = re.sub(r', onOpenPlayer\s*', '', content)
# Fix isLibraryOpen unused
content = re.sub(r'const \[isLibraryOpen, setIsLibraryOpen\] = useState\(false\);\n', '', content)
# Fix newSessionName unused
content = re.sub(r'const \[newSessionName, setNewSessionName\] = useState\(\'\'\);\n', '', content)
# Fix libraryTracks unused
content = re.sub(r'const \[libraryTracks, setLibraryTracks\] = useState<any\[\]>\(\[\]\);\n', '', content)

# Fix track.id to track._id
content = re.sub(r't\.id', 't._id', content)
content = re.sub(r'track\.id', 'track._id', content)

# But wait, preloadedStems use `id`, not `_id`. Let's be careful.
# Let's just fix the specific lines by replacing the whole map functions if needed.

with open(dashboard_path, 'w', encoding='utf-8') as f:
    f.write(content)

mixer_path = r'c:\Users\tauru\Downloads\audio_mixer\frontend\src\components\Mixer.tsx'
with open(mixer_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("lofiEnabled: false", "lofiEnabled: false,\n        fxBlend: 1.0")

with open(mixer_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed")
