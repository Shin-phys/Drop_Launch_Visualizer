#!/usr/bin/env python3
"""src/ のファイルを1つにまとめて、配布用の index.html を作ります。

    python3 build.py

必要なもの: Python 3.6 以上だけ（追加インストールは不要）。
やっていること:
  src/app.html の <link rel="stylesheet"> を src/style.css の中身に置き換え、
  <script src="js/…"> の並びを src/js/ の全ファイルを連結した1つの <script> に置き換える。
  src/js/ は名前順に連結されるので、読み込み順はファイル名の数字（00-, 10-, …）で決まります。
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC  = ROOT / 'src'
OUT  = ROOT / 'index.html'

def main():
    html = (SRC / 'app.html').read_text(encoding='utf-8')
    css  = (SRC / 'style.css').read_text(encoding='utf-8')

    js_files = sorted((SRC / 'js').glob('*.js'))
    if not js_files:
        sys.exit('src/js/ に .js がありません')
    js = '\n'.join(
        '/* ========== %s ========== */\n%s' % (f.name, f.read_text(encoding='utf-8'))
        for f in js_files
    )

    # CSS を差し込む
    link = '<link rel="stylesheet" href="style.css">'
    if link not in html:
        sys.exit('app.html に %s が見つかりません' % link)
    html = html.replace(link, '<style>\n%s\n</style>' % css, 1)

    # <!-- build: … --> 〜 <!-- /build --> を1つの <script> に置き換える
    pat = re.compile(r'<!-- build:.*?-->.*?<!-- /build -->', re.S)
    if not pat.search(html):
        sys.exit('app.html に build マーカーが見つかりません')
    html = pat.sub(lambda m: '<script>\n%s\n</script>' % js, html, count=1)

    # 外部ファイルへの参照が残っていないか確認（単一ファイルで完結させるため）
    leftover = re.findall(r'(?:src|href)="(?!#|data:|https?:)([^"]+)"', html)
    leftover = [x for x in leftover if not x.startswith('mailto:')]
    if leftover:
        sys.exit('外部ファイルへの参照が残っています: %s' % ', '.join(leftover))

    OUT.write_text(html, encoding='utf-8')
    print('できました: %s  (%.1f KB, js %d ファイル)' % (OUT.name, len(html.encode('utf-8'))/1024, len(js_files)))

if __name__ == '__main__':
    main()
