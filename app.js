(() => {
  "use strict";

  const statusLabels = ["ناجح دور أول", "دور ثان", "راسب دور أول", "غياب كلى دور أول"];
  const cache = new Map();
  let mode = "seat";
  let currentResults = [];

  const intro = document.getElementById("intro");
  const queryInput = document.getElementById("result-query");
  const resultsSection = document.getElementById("results-section");
  const searchButton = document.getElementById("search-button");

  const finishIntro = () => {
    if (!intro || intro.classList.contains("intro--leaving")) return;
    intro.classList.add("intro--leaving");
    window.setTimeout(() => {
      intro.remove();
      queryInput.focus();
    }, 720);
  };

  document.getElementById("skip-intro").addEventListener("click", finishIntro);
  window.setTimeout(
    finishIntro,
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 650 : 4300,
  );

  const normalizeArabic = (value) =>
    value
      .normalize("NFKC")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      .replace(/ـ/g, "")
      .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const escapeHtml = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const formatNumber = (value, digits = 1) =>
    new Intl.NumberFormat("ar-EG", { maximumFractionDigits: digits }).format(value);

  const nameBucket = (normalized) =>
    [...normalized.replace(/\s/g, "")]
      .slice(0, 2)
      .map((char) => char.codePointAt(0).toString(16).padStart(4, "0"))
      .join("-");

  async function fetchData(path) {
    if (!cache.has(path)) {
      cache.set(
        path,
        fetch(path).then((response) => {
          if (response.status === 404) return [];
          if (!response.ok) throw new Error("تعذر تحميل بيانات البحث.");
          return response.json();
        }),
      );
    }
    return cache.get(path);
  }

  function setMode(nextMode) {
    mode = nextMode;
    document.querySelectorAll(".mode-switch button").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === mode);
    });
    queryInput.value = "";
    resultsSection.innerHTML = "";
    document.getElementById("query-label").textContent = mode === "seat" ? "رقم الجلوس" : "اسم الطالب";
    document.getElementById("input-icon").textContent = mode === "seat" ? "#" : "⌕";
    document.getElementById("search-hint").textContent =
      mode === "seat"
        ? "تأكد من كتابة رقم الجلوس كاملًا بالأرقام."
        : "اكتب أول حرفين على الأقل، وكل ما زوّدت الاسم النتيجة هتكون أدق.";
    queryInput.inputMode = mode === "seat" ? "numeric" : "text";
    queryInput.dir = mode === "seat" ? "ltr" : "rtl";
    queryInput.placeholder = mode === "seat" ? "مثال: 2001970" : "اكتب الاسم من بدايته";
    queryInput.focus();
  }

  document.querySelectorAll(".mode-switch button").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  function showMessage(message) {
    resultsSection.innerHTML = `
      <div class="message-card" role="alert">
        <span>!</span><div><strong>خلينا نجرب تاني</strong><p>${escapeHtml(message)}</p></div>
      </div>`;
    resultsSection.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function statusTone(status) {
    if (status.includes("ناجح")) return "success";
    if (status.includes("ثان")) return "pending";
    return "neutral";
  }

  function renderResult(student, showBack = false) {
    const percentage = Math.min(100, Math.max(0, (student.totalDegree / 320) * 100));
    const percentageLabel = formatNumber(percentage, 2);
    resultsSection.innerHTML = `
      <article class="result-card">
        <div class="result-card__glow"></div>
        <div class="result-card__header">
          <div>
            <span class="status status--${statusTone(student.studentCaseDesc)}"><i></i>${escapeHtml(student.studentCaseDesc)}</span>
            <p>نتيجة الطالب</p><h2>${escapeHtml(student.arabicName)}</h2>
          </div>
          <div class="score-ring" style="--score:${percentage * 3.6}deg"><div><strong>${percentageLabel}</strong><span>٪</span></div></div>
        </div>
        <div class="result-grid">
          <div class="result-stat"><span>رقم الجلوس</span><strong>${student.seatingNo}</strong></div>
          <div class="result-stat result-stat--highlight"><span>المجموع</span><strong>${formatNumber(student.totalDegree)}<small> / ٣٢٠</small></strong></div>
          <div class="result-stat"><span>النسبة المئوية</span><strong>${percentageLabel}٪</strong></div>
        </div>
        <p class="result-card__wish">مبروك على وصولك للحظة دي، واللي جاي أجمل بإذن الله.</p>
        <div class="result-actions">
          ${showBack ? '<button type="button" class="button button--ghost" id="back-results">رجوع للنتائج</button>' : ""}
          <button type="button" class="button button--secondary" id="share-result">مشاركة النتيجة</button>
        </div>
      </article>`;

    document.getElementById("back-results")?.addEventListener("click", renderMatches);
    document.getElementById("share-result").addEventListener("click", async () => {
      const text = `${student.arabicName} — المجموع ${formatNumber(student.totalDegree)} من ٣٢٠ (${percentageLabel}٪)`;
      if (navigator.share) await navigator.share({ title: "نتيجتك", text }).catch(() => {});
      else await navigator.clipboard.writeText(text).catch(() => {});
    });
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderMatches() {
    const rows = currentResults
      .map(
        (student, index) => `
          <button type="button" class="match-row" data-index="${index}">
            <span class="match-row__avatar">${escapeHtml(student.arabicName.trim().charAt(0))}</span>
            <span class="match-row__name"><b>${escapeHtml(student.arabicName)}</b><small>رقم الجلوس: ${student.seatingNo}</small></span>
            <span class="match-row__score">${formatNumber(student.totalDegree)}<small>درجة</small></span><i>←</i>
          </button>`,
      )
      .join("");
    resultsSection.innerHTML = `
      <div class="matches">
        <div class="matches__heading"><div><p>النتائج المطابقة</p><h2>اختار اسمك من القائمة</h2></div><span>${currentResults.length} نتيجة</span></div>
        <div class="matches__list">${rows}</div>
      </div>`;
    resultsSection.querySelectorAll(".match-row").forEach((row) => {
      row.addEventListener("click", () => renderResult(currentResults[Number(row.dataset.index)], true));
    });
  }

  document.getElementById("search-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = queryInput.value.trim();
    if (mode === "seat" && !/^\d{6,8}$/.test(query)) {
      showMessage("اكتب رقم جلوس صحيح من ٦ إلى ٨ أرقام.");
      return;
    }
    if (mode === "name" && normalizeArabic(query).replace(/\s/g, "").length < 2) {
      showMessage("اكتب أول حرفين على الأقل من اسم الطالب.");
      return;
    }

    searchButton.disabled = true;
    document.getElementById("button-label").textContent = "جاري البحث…";
    resultsSection.innerHTML = "";

    try {
      if (mode === "seat") {
        const rows = await fetchData(`data/seat/${query.slice(0, 3)}.json`);
        const row = rows.find((item) => item[0] === Number(query));
        currentResults = row
          ? [{ seatingNo: row[0], arabicName: row[1], totalDegree: row[2], studentCaseDesc: statusLabels[row[3]] }]
          : [];
      } else {
        const normalized = normalizeArabic(query);
        const rows = await fetchData(`data/name/${nameBucket(normalized)}.json`);
        currentResults = rows
          .filter((item) => item[0].startsWith(normalized))
          .slice(0, 20)
          .map((item) => ({
            seatingNo: item[1],
            arabicName: item[2],
            totalDegree: item[3],
            studentCaseDesc: statusLabels[item[4]],
          }));
      }

      if (currentResults.length === 0) {
        showMessage(
          mode === "seat"
            ? "مش لاقيين نتيجة برقم الجلوس ده. راجع الرقم وجرب تاني."
            : "مش لاقيين اسم مطابق. جرّب كتابة الاسم من بدايته وبشكل أدق.",
        );
      } else if (currentResults.length === 1) renderResult(currentResults[0]);
      else renderMatches();
    } catch {
      showMessage("حصلت مشكلة في تحميل البيانات. جرّب مرة تانية.");
    } finally {
      searchButton.disabled = false;
      document.getElementById("button-label").textContent = "عرض النتيجة";
    }
  });
})();
