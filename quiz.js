(function(){
  "use strict";

  var TERMS = (window.KI_TERMS || []).concat(window.AUTO_TERMS || []);
  var SUBJECTS = window.KI_SUBJECTS || {};
  var ROLES = window.KI_ROLES || {};
  var SCORE_KEY = "ki-begrepsquiz-scores-v1";
  var SAVE_KEY = "ki-begrepsquiz-save-v1";
  var NICKNAME_KEY = "ki-begrepsquiz-nickname-v1";
  var QUESTION_COUNT = 10;
  var MIN_QUESTION_SECONDS = 10;
  var MAX_QUESTION_SECONDS = 30;
  var ANSWER_POINTS = 100;
  var MAX_TIME_BONUS = 100;
  var storageAvailable = true;
  var saveEnabled = true;
  var game = null;
  var selectedScope = "all";
  var currentStreak = 0;
  var scopeConfirmed = true;
  var activeOption = -1;
  var scopeOptions = [];
  var questionTimerInterval = null;

  var els = {
    scopeSearch:document.getElementById("scope-search"),
    scopeToggle:document.getElementById("scope-toggle"),
    scopeList:document.getElementById("scope-listbox"),
    level:document.getElementById("level"),
    nickname:document.getElementById("nickname"),
    nicknameHelp:document.getElementById("nickname-help"),
    nicknameStep:document.getElementById("nickname-step"),
    scopeStep:document.getElementById("scope-step"),
    levelStep:document.getElementById("level-step"),
    nameField:document.getElementById("name-field"),
    mascotMain:document.getElementById("mascot-main"),
    mascotQuiz:document.getElementById("mascot-quiz"),
    bubble:document.getElementById("bubble"),
    readyTitle:document.getElementById("ready-title"),
    scopeLine:document.getElementById("scope-line"),
    factCount:document.getElementById("fact-count"),
    factBest:document.getElementById("fact-best"),
    startHint:document.getElementById("start-hint"),
    quit:document.getElementById("quit"),
    quitLabel:document.getElementById("quit-label"),
    streak:document.getElementById("streak"),
    poolInfo:document.getElementById("pool-info"),
    save:document.getElementById("save-scores"),
    start:document.getElementById("start"),
    clear:document.getElementById("clear-scores"),
    setup:document.getElementById("setup"),
    round:document.getElementById("round"),
    roundName:document.getElementById("round-name"),
    roundProgress:document.getElementById("round-progress"),
    questionTimer:document.getElementById("question-timer"),
    timerValue:document.getElementById("timer-value"),
    timerFill:document.getElementById("timer-fill"),
    progress:document.querySelector('[role="progressbar"]'),
    progressbar:document.querySelector('[role="progressbar"]'),
    label:document.getElementById("prompt-label"),
    question:document.getElementById("question"),
    options:document.getElementById("options"),
    feedback:document.getElementById("feedback"),
    next:document.getElementById("next"),
    result:document.getElementById("result"),
    resultTitle:document.getElementById("result-title"),
    resultMessage:document.getElementById("result-message"),
    resultSaved:document.getElementById("result-saved"),
    scoreNumber:document.getElementById("score-number"),
    scoreRing:document.getElementById("ring-value"),
    scoreRingLabel:document.getElementById("score-ring"),
    resultReview:document.getElementById("result-review"),
    resultBoardCaption:document.getElementById("result-board-caption"),
    resultScoreboard:document.getElementById("result-scoreboard"),
    facts:document.getElementById("result-facts"),
    boardCaption:document.getElementById("board-caption"),
    scoreboard:document.getElementById("scoreboard"),
    boardActions:document.getElementById("board-actions")
  };

  function selectedLevel(){
    var checked = document.querySelector('input[name="quiz-level"]:checked');
    return checked ? checked.value : "all";
  }

  function say(message){
    els.bubble.textContent = message;
    els.bubble.classList.remove("pop");
    void els.bubble.offsetWidth;
    els.bubble.classList.add("pop");
  }

  function mood(element, value, duration){
    element.dataset.mood = value;
    if(duration) window.setTimeout(function(){
      if(element.dataset.mood === value) element.dataset.mood = "idle";
    }, duration);
  }

  function makeMascot(element, size){
    var id = "mascot-clip-" + size;
    element.innerHTML = '<svg class="bot" viewBox="0 0 80 92" role="img" aria-label="Quizmaskot">' +
      '<g class="bot-antenna"><line x1="40" y1="12" x2="40" y2="22" stroke="#9fb3c2" stroke-width="2" stroke-linecap="round"/><circle class="bot-led" cx="40" cy="8" r="3.5" fill="var(--led)"/></g>' +
      '<g class="bot-body"><clipPath id="' + id + '"><circle cx="40" cy="56" r="34"/></clipPath>' +
      '<g clip-path="url(#' + id + ')"><rect width="80" height="56" fill="var(--sky)"/><rect y="56" width="40" height="40" fill="var(--orange-soft)"/><rect x="40" y="56" width="40" height="40" fill="#FBE4CF"/><path d="M0 56h80" stroke="#fff" stroke-width="2"/></g>' +
      '<g class="bot-eyes"><circle cx="31" cy="46" r="3.8" fill="var(--led)"/><circle cx="49" cy="46" r="3.8" fill="var(--led)"/></g>' +
      '<g class="bot-happy" fill="none" stroke="var(--led)" stroke-width="3" stroke-linecap="round"><path d="M27 48q4-6 8 0"/><path d="M45 48q4-6 8 0"/></g></g></svg>';
  }

  function updateNickname(){
    var nickname = els.nickname.value.trim().replace(/\s+/g, " ");
    var looksLikeEmail = /@/.test(nickname);
    var looksLikeFullName = /^[A-ZÆØÅ][a-zæøå]+\s+[A-ZÆØÅ][a-zæøå]+(?:\s+[A-ZÆØÅ][a-zæøå]+)*$/.test(nickname);
    try{
      if(nickname && !looksLikeEmail && !looksLikeFullName) localStorage.setItem(NICKNAME_KEY, JSON.stringify(nickname));
      else localStorage.removeItem(NICKNAME_KEY);
    }catch(error){
      storageAvailable = false;
    }
    if(looksLikeEmail || looksLikeFullName){
      els.nicknameHelp.textContent = looksLikeEmail
        ? "Det ser ut som en e-postadresse — prøv et kallenavn i stedet."
        : "Det kan ligne et fullt navn. Velg gjerne et mer anonymt kallenavn.";
      els.nicknameHelp.className = "hint warn";
      els.nicknameStep.classList.remove("done");
      mood(els.mascotMain, "sad", 1200);
      say("Psst — hold det anonymt!");
    }else if(nickname){
      els.nicknameHelp.textContent = "Topp, " + nickname + "!";
      els.nicknameHelp.className = "hint ok";
      els.nicknameStep.classList.add("done");
      mood(els.mascotMain, "happy", 900);
      say("Hei, " + nickname + "! Kult navn.");
    }else{
      els.nicknameHelp.textContent = "Tom for ideer? Trykk på terningen.";
      els.nicknameHelp.className = "hint";
      els.nicknameStep.classList.remove("done");
      mood(els.mascotMain, "idle");
      say("Hei! Hva skal jeg kalle deg?");
    }
    refreshSetup();
  }

  function text(tag, value, className){
    var node = document.createElement(tag);
    node.textContent = value;
    if(className) node.className = className;
    return node;
  }

  function readStore(key, fallback){
    try{
      var value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    }catch(error){
      storageAvailable = false;
      return fallback;
    }
  }

  function getScores(){
    var data = readStore(SCORE_KEY, {});
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  }

  function getPool(){
    var scope = selectedScope;
    var level = selectedLevel();
    return TERMS.filter(function(term){
      var matchesScope = scope === "all" ||
        (scope.indexOf("subject:") === 0 && Array.isArray(term.f) && term.f.indexOf(scope.slice(8)) !== -1) ||
        (scope.indexOf("role:") === 0 && window.kiRolesForTerm(term).indexOf(scope.slice(5)) !== -1);
      return matchesScope && (level === "all" || term.l === Number(level));
    });
  }

  function variant(){
    return {
      scope:selectedScope,
      level:selectedLevel()
    };
  }

  function variantKey(config){
    return [config.scope, config.level, QUESTION_COUNT].join("|");
  }

  function scopeName(scope){
    if(scope === "all") return "Generell quiz";
    var parts = scope.split(":");
    return parts[0] === "subject" ? SUBJECTS[parts[1]] || parts[1] : ROLES[parts[1]] || parts[1];
  }

  function levelName(id){
    return id === "all" ? "alle nivåer" : "nivå " + id;
  }

  function variantName(config){
    return scopeName(config.scope) + " · " + levelName(config.level) + " · 10 spørsmål";
  }

  function refreshSetup(){
    var pool = getPool();
    var nickname = els.nickname.value.trim().replace(/\s+/g, " ");
    var invalidNickname = /@/.test(nickname) || /^[A-ZÆØÅ][a-zæøå]+\s+[A-ZÆØÅ][a-zæøå]+(?:\s+[A-ZÆØÅ][a-zæøå]+)*$/.test(nickname);
    els.poolInfo.textContent = pool.length + " begreper passer til valgene. Hver quiz har 10 spørsmål.";
    els.start.disabled = pool.length === 0 || !nickname || invalidNickname || !scopeConfirmed;
    if(pool.length < QUESTION_COUNT && pool.length > 0) els.poolInfo.textContent = pool.length + " begreper passer til valgene. Noen begreper får flere spørsmålsformer for å fylle de 10 spørsmålene.";
    if(pool.length === 0) els.poolInfo.textContent = "Det finnes ingen begreper for denne kombinasjonen ennå. Velg et annet fagområde, en annen rolle eller et annet nivå.";
    if(!nickname || invalidNickname) els.poolInfo.textContent += " Velg et anonymt kallenavn for å starte.";
    if(!storageAvailable) els.poolInfo.textContent += " Lokal lagring er utilgjengelig; quizresultater kan ikke lagres.";
    els.factCount.textContent = String(pool.length);
    els.scopeLine.textContent = scopeName(selectedScope) + " · " + levelName(selectedLevel());
    els.readyTitle.textContent = nickname && !invalidNickname ? "Klar, " + nickname + "?" : "Klar for en runde?";
    els.startHint.textContent = nickname && !invalidNickname ? "10 spørsmål · tiden tilpasses hvert spørsmål" : "Velg et kallenavn først, så er du i gang.";
    if(nickname && !invalidNickname) els.nicknameStep.classList.add("done");
    renderBoard();
  }

  function setListOpen(open){
    els.scopeList.hidden = !open;
    els.scopeSearch.closest(".combobox").classList.toggle("open", open);
    els.scopeSearch.setAttribute("aria-expanded", String(open));
    els.scopeToggle.setAttribute("aria-expanded", String(open));
    if(open) renderScopeOptions();
    else{
      activeOption = -1;
      els.scopeSearch.removeAttribute("aria-activedescendant");
      els.scopeSearch.value = scopeOptions.filter(function(option){ return option.value === selectedScope; })[0].label;
    }
  }

  function renderScopeOptions(){
    var query = els.scopeSearch.value.trim().toLocaleLowerCase();
    var filtered = scopeOptions.filter(function(option){
      return !query || option.label.toLocaleLowerCase().indexOf(query) !== -1 ||
        option.group.toLocaleLowerCase().indexOf(query) !== -1;
    });
    els.scopeList.replaceChildren();
    activeOption = Math.min(activeOption, filtered.length - 1);
    var currentGroup = "";
    filtered.forEach(function(option, index){
      if(option.group !== currentGroup){
        currentGroup = option.group;
        var groupLabel = text("li", currentGroup, "combo-group");
        groupLabel.setAttribute("role", "presentation");
        els.scopeList.appendChild(groupLabel);
      }
      var item = text("li", option.label, "combo-option");
      item.id = "scope-option-" + index;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.value === selectedScope));
      item.setAttribute("aria-posinset", String(index + 1));
      item.setAttribute("aria-setsize", String(filtered.length));
      if(index === activeOption) item.classList.add("active");
      item.addEventListener("mousedown", function(event){ event.preventDefault(); });
      item.addEventListener("click", function(){ chooseScope(option); });
      els.scopeList.appendChild(item);
    });
    if(!filtered.length){
      var empty = text("li", "Ingen treff. Prøv et annet søkeord.", "combo-empty");
      empty.setAttribute("role", "presentation");
      els.scopeList.appendChild(empty);
    }
    els.scopeSearch._filteredOptions = filtered;
    if(activeOption >= 0) els.scopeSearch.setAttribute("aria-activedescendant", "scope-option-" + activeOption);
    else els.scopeSearch.removeAttribute("aria-activedescendant");
  }

  function chooseScope(option){
    selectedScope = option.value;
    scopeConfirmed = true;
    setListOpen(false);
    els.scopeStep.classList.add("done");
    mood(els.mascotMain, "happy", 900);
    say(selectedScope === "all" ? "Litt av alt — liker det!" : scopeName(selectedScope) + "? Godt valg.");
    refreshSetup();
  }

  function openScopeOptions(){
    if(scopeConfirmed) els.scopeSearch.value = "";
    scopeConfirmed = true;
    activeOption = -1;
    setListOpen(true);
    els.scopeSearch.focus();
  }

  function moveActiveOption(direction){
    var options = els.scopeSearch._filteredOptions || [];
    if(!options.length) return;
    activeOption = (activeOption + direction + options.length) % options.length;
    var items = els.scopeList.querySelectorAll('[role="option"]');
    items.forEach(function(item, index){
      item.classList.toggle("active", index === activeOption);
    });
    els.scopeSearch.setAttribute("aria-activedescendant", "scope-option-" + activeOption);
    if(items[activeOption]) items[activeOption].scrollIntoView({block:"nearest"});
  }

  function shuffle(items){
    var result = items.slice();
    for(var i = result.length - 1; i > 0; i--){
      var j = Math.floor(Math.random() * (i + 1));
      var temp = result[i];
      result[i] = result[j];
      result[j] = temp;
    }
    return result;
  }

  function makeQuestion(term, kind){
    var prompt = kind === "definition" ? term.d : kind === "english" ? term.en : term.t;
    var answerText = kind === "definition" ? function(item){ return item.t; } : function(item){ return item.d; };
    var seen = {};
    seen[answerText(term).toLocaleLowerCase()] = true;
    var candidates = shuffle(TERMS.filter(function(item){ return item.id !== term.id; }));
    var options = [{term:term, value:answerText(term), correct:true}];
    for(var i = 0; i < candidates.length && options.length < 4; i++){
      var value = answerText(candidates[i]);
      var normalized = value.toLocaleLowerCase();
      if(seen[normalized]) continue;
      seen[normalized] = true;
      options.push({term:candidates[i], value:value, correct:false});
    }
    return {term:term, kind:kind, prompt:prompt, options:shuffle(options)};
  }

  function wordCount(value){
    var words = String(value || "").match(/[\p{L}\p{N}]+/gu);
    return words ? words.length : 0;
  }

  function questionBonusWindow(question){
    var optionWords = question.options.map(function(option){ return wordCount(option.value); });
    var averageOptionWords = optionWords.reduce(function(total, count){ return total + count; }, 0) / optionWords.length;
    var readingSeconds = Math.ceil((wordCount(question.prompt) + averageOptionWords) / 3);
    var thinkingSeconds = 5 + question.term.l +
      (question.kind === "english" ? 2 : question.kind === "definition" ? 1 : 0);
    return Math.max(MIN_QUESTION_SECONDS, Math.min(MAX_QUESTION_SECONDS, readingSeconds + thinkingSeconds));
  }

  function stopQuestionTimer(){
    if(questionTimerInterval !== null){
      window.clearInterval(questionTimerInterval);
      questionTimerInterval = null;
    }
  }

  function updateQuestionTimer(){
    if(!game || !game.bonusDeadline) return;
    var remaining = Math.max(0, game.bonusDeadline - Date.now());
    var fraction = remaining / game.bonusWindow;
    var displayedSeconds = Math.ceil(remaining / 1000);
    els.timerValue.textContent = displayedSeconds + " s";
    els.timerValue.setAttribute("aria-label", displayedSeconds + " sekunder");
    els.timerFill.style.transform = "scaleX(" + fraction + ")";
    els.questionTimer.dataset.state = remaining === 0 ? "bonus-ended" : remaining <= 5000 ? "urgent" : "ready";
    if(remaining === 0) stopQuestionTimer();
  }

  function startQuestionTimer(question){
    stopQuestionTimer();
    game.bonusWindow = questionBonusWindow(question) * 1000;
    game.questionStarted = Date.now();
    game.bonusDeadline = game.questionStarted + game.bonusWindow;
    els.questionTimer.dataset.limit = String(game.bonusWindow / 1000);
    updateQuestionTimer();
    if(questionTimerInterval === null) questionTimerInterval = window.setInterval(updateQuestionTimer, 100);
  }

  function stopAndMeasureQuestion(){
    stopQuestionTimer();
    var elapsed = Math.max(0, Date.now() - game.questionStarted);
    var bonusTimeRemaining = Math.max(0, game.bonusWindow - elapsed);
    game.elapsed += elapsed;
    return {
      elapsed:elapsed,
      limit:game.bonusWindow,
      timeBonus:Math.floor(MAX_TIME_BONUS * bonusTimeRemaining / game.bonusWindow)
    };
  }

  function beginRound(){
    var config = variant();
    var pool = getPool();
    if(!pool.length) return;
    config.nickname = els.nickname.value.trim().replace(/\s+/g, " ");
    currentStreak = 0;
    var questionBank = [];
    pool.forEach(function(term){
      ["definition", "term"].concat(term.en ? ["english"] : []).forEach(function(kind){
        questionBank.push({term:term, kind:kind});
      });
    });
    questionBank = shuffle(questionBank);
    game = {
      config:config,
      questions:Array.from({length:QUESTION_COUNT}, function(_, index){
        var item = questionBank[index % questionBank.length];
        return makeQuestion(item.term, item.kind);
      }),
      index:0,
      correct:0,
      points:0,
      timeBonus:0,
      elapsed:0,
      wrongs:[]
    };
    els.progress.replaceChildren();
    game.questions.forEach(function(){
      els.progress.appendChild(document.createElement("span"));
    });
    els.progress.setAttribute("aria-valuenow", "0");
    els.setup.hidden = true;
    els.result.hidden = true;
    els.round.hidden = false;
    mood(els.mascotQuiz, "think");
    els.quit.classList.remove("confirm");
    els.quitLabel.textContent = "Avslutt";
    renderQuestion();
  }

  function renderQuestion(){
    var question = game.questions[game.index];
    var index = game.index + 1;
    els.roundName.textContent = variantName(game.config);
    els.roundProgress.textContent = "Spørsmål " + index + " av " + game.questions.length;
    Array.from(els.progress.children).forEach(function(segment, segmentIndex){
      if(segmentIndex === game.index) segment.className = "current";
      else if(segmentIndex > game.index) segment.className = "";
    });
    els.progress.setAttribute("aria-valuenow", String(Math.round(game.index / game.questions.length * 100)));
    els.label.textContent = question.kind === "definition" ? "Hvilket begrep forklares her?" :
      question.kind === "english" ? "Hva betyr dette begrepet?" : "Hva innebærer dette begrepet?";
    els.question.textContent = question.prompt;
    els.feedback.hidden = true;
    els.feedback.textContent = "";
    els.feedback.className = "feedback";
    els.next.hidden = true;
    els.next.textContent = index === game.questions.length ? "Se resultat" : "Neste spørsmål";
    els.options.replaceChildren();
    question.options.forEach(function(option, optionIndex){
      var button = text("button", "", "option");
      button.type = "button";
      var key = text("span", String.fromCharCode(65 + optionIndex), "option-key");
      var label = text("span", option.value);
      button.appendChild(key);
      button.appendChild(label);
      button.addEventListener("click", function(){ answer(option); });
      els.options.appendChild(button);
    });
    els.streak.textContent = currentStreak >= 2 ? "🔥 " + currentStreak + " på rad" : "";
    els.streak.classList.toggle("on", currentStreak >= 2);
    mood(els.mascotQuiz, "think");
    startQuestionTimer(question);
    els.question.focus();
  }

  function answer(selected){
    if(!game || els.next.hidden === false) return;
    var question = game.questions[game.index];
    var timing = stopAndMeasureQuestion();
    if(selected.correct){
      game.correct++;
      game.timeBonus += timing.timeBonus;
      game.points += ANSWER_POINTS + timing.timeBonus;
    }
    Array.from(els.options.children).forEach(function(optionButton, index){
      var option = question.options[index];
      optionButton.disabled = true;
      optionButton.setAttribute("aria-pressed", option === selected ? "true" : "false");
      if(option === selected) optionButton.dataset.correct = String(selected.correct);
    });
    if(selected.correct){
      currentStreak++;
      mood(els.mascotQuiz, "happy", 1000);
    }else{
      currentStreak = 0;
      game.wrongs.push(question.term);
      mood(els.mascotQuiz, "sad", 1000);
    }
    els.progress.children[game.index].className = selected.correct ? "complete" : "incorrect";
    var correct = question.options.filter(function(option){ return option.correct; })[0];
    els.feedback.className = "feedback " + (selected.correct ? "" : "incorrect");
    var response = selected.correct
      ? (currentStreak >= 3 ? "Riktig — " + currentStreak + " på rad! " : "Riktig! ") +
        "+" + (ANSWER_POINTS + timing.timeBonus) + " poeng" +
        (timing.timeBonus === 0 ? " · tidsbonusvinduet er brukt opp" : "")
      : "Ikke helt. Riktig svar: " + correct.value;
    els.feedback.appendChild(text("strong", response));
    els.feedback.appendChild(text("p", question.term.d));
    els.feedback.hidden = false;
    els.next.hidden = false;
    var percentage = Math.round((game.index + 1) / game.questions.length * 100);
    els.progress.setAttribute("aria-valuenow", String(percentage));
    els.next.focus();
  }

  function addFact(label, value){
    var fact = document.createElement("div");
    fact.className = "fact";
    fact.appendChild(text("span", label));
    fact.appendChild(text("strong", value));
    els.facts.appendChild(fact);
  }

  function saveRound(record){
    if(!saveEnabled || !storageAvailable) return false;
    try{
      var scores = getScores();
      var key = variantKey(record.config);
      var records = Array.isArray(scores[key]) ? scores[key] : [];
      records.push(record);
      var timedRecords = records.filter(function(item){ return Number.isInteger(item.points); });
      var historicRecords = records.filter(function(item){ return !Number.isInteger(item.points); });
      timedRecords.sort(function(a, b){
        return (b.points - a.points) || (b.correct - a.correct) ||
          (a.duration - b.duration) || (b.date.localeCompare(a.date));
      });
      scores[key] = timedRecords.slice(0, 10).concat(historicRecords);
      localStorage.setItem(SCORE_KEY, JSON.stringify(scores));
      return true;
    }catch(error){
      storageAvailable = false;
      return false;
    }
  }

  function finishRound(){
    stopQuestionTimer();
    var duration = game.elapsed;
    var record = {
      correct:game.correct,
      total:game.questions.length,
      points:game.points,
      timeBonus:game.timeBonus,
      duration:duration,
      date:new Date().toISOString(),
      nickname:game.config.nickname,
      config:game.config
    };
    var saved = saveRound(record);
    els.round.hidden = true;
    els.result.hidden = false;
    var messages = game.correct === 10
      ? ["Perfekt, " + game.config.nickname + "!", "Alle ti riktige. Du er en ekte begrepsmester."]
      : game.correct >= 8
        ? ["Sterkt levert!", "Du har god kontroll på begrepene. Noen få å pusse på."]
        : game.correct >= 5
          ? ["Godt jobbet!", "Du er godt i gang. En runde til, så sitter det enda bedre."]
          : ["Fin start!", "Øvelse gjør mester. Se gjennom begrepene under og prøv igjen."];
    els.resultTitle.textContent = messages[0];
    els.resultMessage.textContent = messages[1];
    els.resultSaved.textContent = saved ? "Resultatet er lagret på denne enheten." :
      saveEnabled ? "Resultatet ble ikke lagret. Lagring er slått av eller utilgjengelig." : "Resultatet ble ikke lagret, slik du har valgt.";
    els.scoreNumber.textContent = String(game.correct);
    els.scoreRing.style.strokeDashoffset = String(490.1 * (1 - game.correct / game.questions.length));
    els.scoreRingLabel.setAttribute("aria-label", game.correct + " av " + game.questions.length + " riktige");
    els.facts.replaceChildren();
    addFact("Poeng", String(game.points));
    addFact("Tidsbonus", String(game.timeBonus));
    addFact("Riktige svar", game.correct + " / " + game.questions.length);
    addFact("Tid", Math.round(duration / 1000) + " s");
    els.resultReview.replaceChildren();
    var missed = [];
    game.wrongs.forEach(function(term){
      if(!missed.some(function(item){ return item.id === term.id; })) missed.push(term);
    });
    if(missed.length){
      els.resultReview.hidden = false;
      els.resultReview.appendChild(text("h3", "Verdt å se på igjen"));
      var list = document.createElement("ul");
      list.className = "review-list";
      missed.forEach(function(term){
        var item = document.createElement("li");
        item.appendChild(text("strong", term.t));
        item.appendChild(text("span", term.d));
        list.appendChild(item);
      });
      els.resultReview.appendChild(list);
    }else{
      els.resultReview.hidden = true;
    }
    els.resultTitle.focus();
    game = null;
    renderBoard();
  }

  function renderBoard(){
    var config = variant();
    els.boardCaption.textContent = variantName(config) + ". Resultatene er bare lagret lokalt i denne nettleseren.";
    els.resultBoardCaption.textContent = els.boardCaption.textContent;
    var all = getScores();
    var records = all[variantKey(config)];
    els.scoreboard.replaceChildren();
    els.boardActions.replaceChildren();
    els.resultScoreboard.replaceChildren();
    var timedRecords = Array.isArray(records) ? records.filter(function(record){ return Number.isInteger(record.points); }) : [];
    var historicRecords = Array.isArray(records) ? records.filter(function(record){ return !Number.isInteger(record.points); }) : [];
    els.factBest.textContent = timedRecords.length ? String(timedRecords[0].points) : "–";
    if(!Array.isArray(records) || !records.length){
      var empty = document.createElement("div");
      empty.className = "board-empty";
      var icon = document.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4a3 3 0 0 0 3 4m10-4h3a3 3 0 0 1-3 4m-5 4v4m-4 2h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      empty.appendChild(icon);
      empty.appendChild(text("span", saveEnabled ? "Ingen resultater ennå. Første runde setter rekorden." : "Ingen resultater for denne quizen. Lagring er slått av."));
      els.scoreboard.appendChild(empty);
      els.resultScoreboard.appendChild(empty.cloneNode(true));
    }else{
      function appendTable(target, items, historic){
        if(!items.length) return;
        var table = document.createElement("table");
        var head = document.createElement("thead");
        var headingRow = document.createElement("tr");
        (historic ? ["#", "Kallenavn", "Riktige", "Tid", "Dato"] : ["#", "Kallenavn", "Poeng", "Riktige", "Tid", "Dato"])
          .forEach(function(label){ headingRow.appendChild(text("th", label)); });
        head.appendChild(headingRow);
        table.appendChild(head);
        var body = document.createElement("tbody");
        items.forEach(function(record, index){
          if(!record || !Number.isInteger(record.correct) || !Number.isInteger(record.total)) return;
          var row = document.createElement("tr");
          var date = new Date(record.date);
          var values = [
            String(index + 1),
            typeof record.nickname === "string" ? record.nickname : "Anonym"
          ];
          if(!historic) values.push(String(record.points));
          values.push(
            record.correct + " / " + record.total,
            Math.round(Number(record.duration || 0) / 1000) + " s",
            Number.isNaN(date.getTime()) ? "–" : new Intl.DateTimeFormat("nb-NO", {day:"numeric", month:"short", year:"numeric"}).format(date)
          );
          values.forEach(function(value){ row.appendChild(text("td", value)); });
          body.appendChild(row);
        });
        table.appendChild(body);
        target.appendChild(table);
      }
      function renderBoardContents(target){
        appendTable(target, timedRecords, false);
        if(historicRecords.length){
          target.appendChild(text("h4", "Tidligere runder uten tidsbonus", "historic-title"));
          appendTable(target, historicRecords, true);
        }
      }
      renderBoardContents(els.scoreboard);
      renderBoardContents(els.resultScoreboard);
    }
    var hasScores = Object.keys(all).some(function(key){
      return Array.isArray(all[key]) && all[key].length > 0;
    });
    if(hasScores){
      var clear = text("button", "Slett alle lagrede resultater", "link-btn");
      clear.type = "button";
      clear.addEventListener("click", clearScores);
      els.boardActions.appendChild(clear);
    }
  }

  function clearScores(){
    if(!storageAvailable){
      els.poolInfo.textContent = "Lokal lagring er utilgjengelig, så det finnes ingen lagrede resultater å slette.";
      return;
    }
    if(!window.confirm("Slette alle quizresultater som er lagret i denne nettleseren?")) return;
    try{
      localStorage.removeItem(SCORE_KEY);
      refreshSetup();
      els.poolInfo.textContent = "Lagrede quizresultater er slettet fra denne nettleseren.";
      say("Blanke ark!");
    }catch(error){
      storageAvailable = false;
      els.poolInfo.textContent = "Resultatene kunne ikke slettes fordi nettleseren ikke tillater lokal lagring.";
    }
  }

  scopeOptions.push({value:"all", label:"Generell quiz – alle fag og roller", group:"Generell"});
  Object.keys(SUBJECTS).forEach(function(id){
    scopeOptions.push({value:"subject:" + id, label:SUBJECTS[id], group:"Fagområde"});
  });
  Object.keys(ROLES).forEach(function(id){
    scopeOptions.push({value:"role:" + id, label:ROLES[id], group:"Rolle"});
  });
  els.scopeSearch.value = scopeOptions[0].label;
  var params = new URLSearchParams(window.location.search);
  var initialScope = params.get("scope");
  var scopeOption = scopeOptions.filter(function(option){ return option.value === initialScope; })[0];
  if(scopeOption){
    selectedScope = scopeOption.value;
    scopeConfirmed = true;
    els.scopeSearch.value = scopeOption.label;
    els.scopeStep.classList.add("done");
  }
  var initialLevel = params.get("level");
  if(["all","1","2","3","4"].indexOf(initialLevel) !== -1){
    var levelOption = document.querySelector('input[name="quiz-level"][value="' + initialLevel + '"]');
    if(levelOption){
      levelOption.checked = true;
      els.level.value = initialLevel;
      els.levelStep.classList.add("done");
    }
  }

  try{
    localStorage.setItem(SAVE_KEY, localStorage.getItem(SAVE_KEY) || "1");
    saveEnabled = localStorage.getItem(SAVE_KEY) !== "0";
  }catch(error){
    storageAvailable = false;
  }
  var savedNickname = readStore(NICKNAME_KEY, "");
  if(typeof savedNickname === "string") els.nickname.value = savedNickname;
  els.save.checked = saveEnabled;
  els.scopeSearch.addEventListener("focus", function(){
    if(els.scopeList.hidden) openScopeOptions();
  });
  els.scopeSearch.addEventListener("input", function(){
    scopeConfirmed = false;
    activeOption = -1;
    setListOpen(true);
    renderScopeOptions();
    refreshSetup();
  });
  els.scopeSearch.addEventListener("keydown", function(event){
    if(event.key === "ArrowDown"){
      event.preventDefault();
      if(els.scopeList.hidden) openScopeOptions();
      moveActiveOption(1);
    }else if(event.key === "ArrowUp"){
      event.preventDefault();
      if(els.scopeList.hidden) openScopeOptions();
      moveActiveOption(-1);
    }else if(event.key === "Enter" && !els.scopeList.hidden){
      var options = els.scopeSearch._filteredOptions || [];
      if(activeOption >= 0 && options[activeOption]){
        event.preventDefault();
        chooseScope(options[activeOption]);
      }
    }else if(event.key === "Escape" && !els.scopeList.hidden){
      event.preventDefault();
      scopeConfirmed = true;
      setListOpen(false);
      refreshSetup();
    }
  });
  els.scopeToggle.addEventListener("click", function(){
    if(els.scopeList.hidden) openScopeOptions();
    else{
      scopeConfirmed = true;
      setListOpen(false);
      refreshSetup();
      els.scopeToggle.focus();
    }
  });
  document.addEventListener("click", function(event){
    if(!event.target.closest(".combobox") && !els.scopeList.hidden){
      scopeConfirmed = true;
      setListOpen(false);
      refreshSetup();
    }
  });
  document.querySelectorAll('input[name="quiz-level"]').forEach(function(radio){
    radio.addEventListener("change", function(){
      els.level.value = radio.value;
      els.levelStep.classList.add("done");
      var messages = {"all":"Litt av hvert, da!","1":"Fin oppvarming.","2":"Nå begynner det å bli moro.","3":"Ooh, modig!","4":"Klar for ekspertmodus?"};
      mood(els.mascotMain, radio.value === "4" ? "think" : "happy", 900);
      say(messages[radio.value]);
      refreshSetup();
    });
  });
  els.nickname.addEventListener("input", updateNickname);
  els.nickname.addEventListener("keydown", function(event){
    if(event.key === "Enter"){
      event.preventDefault();
      els.scopeSearch.focus();
    }
  });
  document.getElementById("nickname-dice").addEventListener("click", function(event){
    var names = ["Prompt-Petter","Token-Tove","Vektor-Vidar","Embedding-Elin","Gradient-Gro","Modell-Magnus","Kontekst-Kari","Agent-Anders","Nevron-Nora","Bias-Bjørn","Parameter-Pia","Transformer-Trond"];
    var nickname = names[Math.floor(Math.random() * names.length)];
    els.nickname.value = nickname;
    event.currentTarget.classList.remove("roll");
    void event.currentTarget.offsetWidth;
    event.currentTarget.classList.add("roll");
    updateNickname();
    els.nickname.focus();
  });
  els.save.addEventListener("change", function(){
    saveEnabled = els.save.checked;
    try{ localStorage.setItem(SAVE_KEY, saveEnabled ? "1" : "0"); }
    catch(error){ storageAvailable = false; }
    refreshSetup();
  });
  els.start.addEventListener("click", beginRound);
  els.next.addEventListener("click", function(){
    if(game.index + 1 < game.questions.length){ game.index++; renderQuestion(); }
    else finishRound();
  });
  document.getElementById("again").addEventListener("click", beginRound);
  document.getElementById("change-quiz").addEventListener("click", function(){
    els.result.hidden = true;
    els.setup.hidden = false;
    els.start.focus();
  });

  els.quit.addEventListener("click", function(){
    if(els.quit.classList.contains("confirm")){
      stopQuestionTimer();
      els.quit.classList.remove("confirm");
      els.quitLabel.textContent = "Avslutt";
      els.round.hidden = true;
      els.setup.hidden = false;
      refreshSetup();
      say("Velkommen tilbake!");
      return;
    }
    els.quit.classList.add("confirm");
    els.quitLabel.textContent = "Klikk igjen for å avslutte";
    window.setTimeout(function(){
      els.quit.classList.remove("confirm");
      els.quitLabel.textContent = "Avslutt";
    }, 3000);
  });

  makeMascot(els.mascotMain, 112);
  makeMascot(els.mascotQuiz, 58);

  if(!TERMS.length || !Object.keys(SUBJECTS).length){
    els.poolInfo.textContent = "Begrepslisten kunne ikke lastes. Gå tilbake til oppslagsverket, og prøv igjen.";
    els.start.disabled = true;
  }else{
    if(els.nickname.value) updateNickname();
    else refreshSetup();
  }
})();
