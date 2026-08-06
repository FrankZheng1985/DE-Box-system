/*
 * 法务页语言切换
 *
 * 三种语言各是一个 <section data-lang="...">，切换只是显示/隐藏，
 * 不做 key-value 翻译 —— 法律长文用 data-i18n 拼字符串既难维护又容易漏译。
 *
 * 德文版是有法律效力的版本，所以默认德文、且任何异常情况都回落到德文。
 */
(function () {
  var SUPPORTED = ['de', 'en', 'zh'];

  function switchLang(lang) {
    if (SUPPORTED.indexOf(lang) === -1) lang = 'de';

    document.querySelectorAll('section[data-lang]').forEach(function (section) {
      section.hidden = section.getAttribute('data-lang') !== lang;
    });

    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.textContent.trim().toLowerCase() === lang ||
        (lang === 'zh' && btn.textContent.trim() === '中文'));
    });

    // 让读屏软件和搜索引擎知道当前页面语言
    document.documentElement.lang = lang;
  }

  // 供 HTML 里的 onclick 调用
  window.switchLang = switchLang;

  // 刻意不按浏览器语言自动切换：德文版是有法律效力的版本，
  // 默认就该是德文（官网首页同样默认 DE）。译文由访客自己点开。
})();
