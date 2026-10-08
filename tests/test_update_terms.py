import importlib.util
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "update_terms.py"
SPEC = importlib.util.spec_from_file_location("update_terms", SCRIPT)
update_terms = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(update_terms)

VALID_TERM = {
    "id": "nytt-begrep",
    "t": "Nytt begrep",
    "en": "new term",
    "l": 2,
    "f": ["genai"],
    "v": ["generelt"],
    "k": ["teknologiradet"],
    "d": "En kort forklaring.",
}


class TermValidationTests(unittest.TestCase):
    def setUp(self):
        self.subjects = {"genai", "grunnleggende"}
        self.tools = {"generelt", "claude"}
        self.sources = {"teknologiradet", "nist"}
        self.term = dict(VALID_TERM)

    def validate(self, term=None):
        return update_terms.validate_terms(
            [term or self.term], set(), self.sources, self.subjects, self.tools
        )

    def test_accepts_valid_term_and_marks_it_new(self):
        self.assertTrue(self.validate()[0]["nytt"])
        published = self.validate()[0]
        with self.assertRaisesRegex(ValueError, "unsupported fields"):
            update_terms.validate_terms(
                [published], set(), self.sources, self.subjects, self.tools
            )
        self.assertEqual(
            update_terms.validate_terms(
                [published],
                set(),
                self.sources,
                self.subjects,
                self.tools,
                allow_published=True,
            ),
            [published],
        )

    def test_normalizes_title_before_slug_validation(self):
        for title, expected in (
            ("  nytt begrep", "Nytt begrep"),
            (" (nytt begrep)", "(Nytt begrep)"),
        ):
            with self.subTest(title=title):
                term = self.validate({**self.term, "t": title})[0]
                self.assertEqual(term["t"], expected)

    def test_rejects_duplicate_unknown_taxonomy_and_markup(self):
        cases = [
            ({**self.term, "id": "existing"}, {"existing"}, self.sources, self.subjects, self.tools),
            ({**self.term, "f": ["unknown"]}, set(), self.sources, self.subjects, self.tools),
            ({**self.term, "v": ["unknown"]}, set(), self.sources, self.subjects, self.tools),
            ({**self.term, "k": ["unknown"]}, set(), self.sources, self.subjects, self.tools),
            ({**self.term, "d": "<script>bad</script>"}, set(), self.sources, self.subjects, self.tools),
        ]
        for term, existing, sources, subjects, tools in cases:
            with self.subTest(term=term), self.assertRaises(ValueError):
                update_terms.validate_terms([term], existing, sources, subjects, tools)

    def test_rejects_wrong_level_and_duplicate_ids(self):
        with self.assertRaises(ValueError):
            self.validate({**self.term, "l": True})
        with self.assertRaises(ValueError):
            update_terms.validate_terms(
                [self.term, self.term], set(), self.sources, self.subjects, self.tools
            )
        with self.assertRaisesRegex(ValueError, "more than 20"):
            update_terms.validate_terms(
                [self.term] * 21, set(), self.sources, self.subjects, self.tools
            )

    def test_limits_published_terms_to_twenty(self):
        terms = [{"id": f"term-{number}"} for number in range(25)]
        limited = update_terms.limit_generated_terms(terms)
        self.assertEqual(len(limited), 20)
        self.assertEqual(limited, terms[:20])

    def test_allows_published_glossary_to_exceed_twenty_terms(self):
        terms = [
            {
                **self.term,
                "id": f"begrep-{number}",
                "t": f"Begrep {number}",
                "nytt": True,
            }
            for number in range(21)
        ]
        validated = update_terms.validate_terms(
            terms,
            set(),
            self.sources,
            self.subjects,
            self.tools,
            allow_published=True,
        )
        self.assertEqual(len(validated), 21)

    def test_ignores_existing_and_repeated_suggestions(self):
        terms = [
            {"id": "grunnmodell", "t": "Grunnmodell"},
            {"id": "nytt-begrep", "t": "Nytt begrep"},
            {"id": "nytt-begrep", "t": "Nytt begrep"},
            {"id": "annet-begrep", "t": "Annet begrep"},
        ]
        with patch("builtins.print") as warning:
            unique = update_terms.exclude_known_and_duplicate_terms(
                terms, {"grunnmodell"}
            )
        self.assertEqual(
            unique,
            [
                {"id": "nytt-begrep", "t": "Nytt begrep"},
                {"id": "annet-begrep", "t": "Annet begrep"},
            ],
        )
        self.assertEqual(warning.call_count, 2)
        self.assertIn("ignoring that suggestion", warning.call_args_list[0].args[0])

    def test_ignores_terms_with_duplicate_normalized_names(self):
        terms = [
            {"id": "nytt-begrep", "t": "Nytt begrep", "en": "MODEL-context protocol"},
            {"id": "annet-begrep", "t": "Annet begrep", "en": "Completely novel"},
            {"id": "enda-et-begrep", "t": "Enda et begrep", "en": "completely novel"},
        ]
        existing = [{"id": "mcp", "t": "Model Context Protocol", "en": "MCP"}]
        with patch("builtins.print") as warning:
            unique = update_terms.exclude_known_and_duplicate_terms(
                terms, set(), existing
            )
        self.assertEqual(unique, terms[1:2])
        self.assertEqual(warning.call_count, 2)
        self.assertNotEqual(
            update_terms.normalize_term_label("C++"),
            update_terms.normalize_term_label("C"),
        )


class RepositoryIntegrationTests(unittest.TestCase):
    def test_discovers_documented_sources_and_taxonomies(self):
        index = update_terms.INDEX.read_text(encoding="utf-8")
        terms_source = update_terms.BASE_TERMS.read_text(encoding="utf-8")
        sources = update_terms.parse_sources(index)
        self.assertEqual(len(sources), 31)
        self.assertIn("teknologiradet", {source["id"] for source in sources})
        self.assertEqual(len(update_terms.parse_taxonomy(index, "FAGOMRADER")), 9)
        self.assertEqual(len(update_terms.parse_taxonomy(index, "ROLLER")), 16)
        self.assertEqual(len(update_terms.parse_taxonomy(index, "VERKTOY")), 7)
        self.assertEqual(len(update_terms.parse_existing_term_ids(terms_source)), 97)
        self.assertEqual(len(update_terms.parse_existing_terms(terms_source)), 97)
        auto_terms = update_terms.read_auto_terms()[1]
        for term in update_terms.parse_existing_terms(terms_source) + auto_terms:
            first_letter = next((character for character in term["t"] if character.isalpha()), "")
            self.assertTrue(first_letter.isupper(), f"{term['id']} starts with lowercase: {term['t']!r}")
        self.assertEqual(
            update_terms.parse_level_descriptions(index),
            {
                1: "Nivå 1: du er ny med KI og trenger vokabularet for å delta i samtalen.",
                2: "Nivå 2: du bruker KI jevnlig og vil forstå hvordan løsningene settes sammen.",
                3: "Nivå 3: du designer, bygger eller styrer KI-løsninger i leveranse.",
                4: "Nivå 4: du går inn i modellenes indre virkemåte og forskningsfronten.",
            },
        )

    def test_glossary_and_quiz_load_one_shared_term_source(self):
        index = update_terms.INDEX.read_text(encoding="utf-8")
        quiz = (update_terms.ROOT / "quiz.html").read_text(encoding="utf-8")
        terms_source = update_terms.BASE_TERMS.read_text(encoding="utf-8")
        self.assertIn('<script src="terms.js"></script>', index)
        self.assertIn('<script src="terms.js"></script>', quiz)
        self.assertIn('class="quiz-cta"', index)
        self.assertIn('id="cta-link"', index)
        self.assertIn("function updateQuizCta()", index)
        self.assertIn("--cta-glow:#FFF4E8", index)
        self.assertIn("background:var(--surface); border:1px solid var(--line);", index)
        self.assertNotIn("border-left:4px solid var(--coral)", index)
        self.assertIn('new URLSearchParams(window.location.search)', (update_terms.ROOT / "quiz.js").read_text(encoding="utf-8"))
        self.assertIn(".privacy{", quiz)
        self.assertIn("text-align:left", quiz)
        self.assertIn('id="mascot-main"', quiz)
        self.assertIn("Hva vil du kalle deg?", quiz)
        self.assertIn('class="btn btn-primary btn-start" id="start"', quiz)
        self.assertIn("Endre oppsett", quiz)
        self.assertIn('id="level-4"', quiz)
        self.assertIn('id="scope-search"', quiz)
        self.assertIn('id="question-timer"', quiz)
        self.assertIn('id="timer-value"', quiz)
        self.assertIn('class="name-input-wrap"', quiz)
        self.assertIn("align-items:stretch", quiz)
        self.assertIn("window.KI_TERMS = [", terms_source)
        self.assertIn("window.KI_SUBJECTS = {", terms_source)
        self.assertIn("window.KI_ROLES = {", terms_source)
        self.assertIn("window.kiRolesForTerm = function(term)", terms_source)
        self.assertNotIn("var TERMS = [", index)
        self.assertNotIn("window.KI_TERMS = [", quiz)
        workflow = (update_terms.ROOT / ".github" / "workflows" / "daily-terms.yml").read_text(encoding="utf-8")
        self.assertIn("quiz.js", workflow)
        self.assertLess(workflow.index("python -m unittest"), workflow.index("python scripts/update_terms.py"))
        quiz_script = (update_terms.ROOT / "quiz.js").read_text(encoding="utf-8")
        self.assertIn("function questionBonusWindow(question)", quiz_script)
        self.assertNotIn("function expireQuestion()", quiz_script)
        self.assertIn("bonusTimeRemaining", quiz_script)
        self.assertIn("[data-state=bonus-ended]", quiz)
        self.assertIn("timedRecords.slice(0, 10).concat(historicRecords)", quiz_script)

    def test_published_terms_have_no_duplicate_normalized_names(self):
        base_terms = update_terms.parse_existing_terms(
            update_terms.BASE_TERMS.read_text(encoding="utf-8")
        )
        auto_terms = update_terms.read_auto_terms()[1]
        labels = {}
        duplicates = []
        for term in base_terms + auto_terms:
            for field in ("t", "en"):
                label = update_terms.normalize_term_label(term.get(field))
                if not label:
                    continue
                previous_id = labels.get(label)
                if previous_id and previous_id != term["id"]:
                    duplicates.append((label, previous_id, term["id"]))
                labels[label] = term["id"]
        self.assertEqual(duplicates, [])

    def test_missing_api_key_stops_before_source_fetch(self):
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(update_terms, "fetch_source") as fetch_source,
            self.assertRaisesRegex(ValueError, "GEMINI_API_KEY is missing"),
        ):
            update_terms.run()
        fetch_source.assert_not_called()

    def test_source_redirect_must_remain_https(self):
        response = MagicMock()
        response.__enter__.return_value = response
        response.geturl.return_value = "http://example.org/source"
        with patch.object(update_terms, "urlopen", return_value=response):
            with self.assertRaisesRegex(ValueError, "redirected away from HTTPS"):
                update_terms.fetch_source(
                    {"id": "public", "name": "Public source", "url": "https://example.org/source"}
                )

    def test_run_publishes_new_terms_and_tracks_source_hashes(self):
        source = update_terms.parse_sources(
            update_terms.INDEX.read_text(encoding="utf-8")
        )[0]
        old_term = {
            **VALID_TERM,
            "id": "gammelt-auto",
            "t": "Gammelt auto",
            "nytt": True,
        }
        new_term = {**VALID_TERM, "nytt": True}
        with tempfile.TemporaryDirectory() as directory:
            state_path = Path(directory) / "state.json"
            terms_path = Path(directory) / "terms.js"
            state_path.write_text("{}\n", encoding="utf-8")
            with (
                patch.dict(os.environ, {"GEMINI_API_KEY": "test-secret"}),
                patch.object(update_terms, "STATE", state_path),
                patch.object(update_terms, "TERMS_FILE", terms_path),
                patch.object(update_terms, "parse_sources", return_value=[source]),
                patch.object(update_terms, "fetch_source", return_value=("excerpt", "full source text")),
                patch.object(update_terms, "generate_terms", return_value=[new_term]) as generate,
            ):
                update_terms.write_terms("2026-10-04", [old_term])
                update_terms.run()
                _, published = update_terms.read_auto_terms()
            stored_state = json.loads(state_path.read_text(encoding="utf-8"))

        self.assertEqual(generate.call_args.args[1], {"gammelt-auto"})
        self.assertEqual([term["id"] for term in published], ["gammelt-auto", "nytt-begrep"])
        self.assertEqual(stored_state[source["id"]], update_terms.hashlib.sha256(b"full source text").hexdigest())

    def test_run_repairs_lowercase_published_titles_without_new_terms(self):
        source = update_terms.parse_sources(
            update_terms.INDEX.read_text(encoding="utf-8")
        )[0]
        old_term = {
            **VALID_TERM,
            "id": "gammelt-auto",
            "t": "  gammelt auto",
            "nytt": True,
        }
        source_text = "full source text"
        source_hash = update_terms.hashlib.sha256(source_text.encode("utf-8")).hexdigest()
        with tempfile.TemporaryDirectory() as directory:
            state_path = Path(directory) / "state.json"
            terms_path = Path(directory) / "terms.js"
            state_path.write_text(json.dumps({source["id"]: source_hash}), encoding="utf-8")
            with (
                patch.dict(os.environ, {"GEMINI_API_KEY": "test-secret"}),
                patch.object(update_terms, "STATE", state_path),
                patch.object(update_terms, "TERMS_FILE", terms_path),
                patch.object(update_terms, "parse_sources", return_value=[source]),
                patch.object(update_terms, "fetch_source", return_value=("excerpt", source_text)),
                patch.object(update_terms, "generate_terms") as generate,
            ):
                update_terms.write_terms("2026-10-04", [old_term])
                update_terms.run()
                updated, published = update_terms.read_auto_terms()

        generate.assert_not_called()
        self.assertEqual(updated, "2026-10-04")
        self.assertEqual(published[0]["t"], "Gammelt auto")

    def test_auto_terms_file_round_trips_generated_json(self):
        term = {
            **VALID_TERM,
            "nytt": True,
            "d": "A < B & C",
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "terms.js"
            with patch.object(update_terms, "TERMS_FILE", path):
                update_terms.write_terms("2026-10-05", [term])
                updated, terms = update_terms.read_auto_terms()
        self.assertEqual(updated, "2026-10-05")
        self.assertEqual(terms, [term])

    def test_gemini_interactions_request_uses_secret_and_json_schema(self):
        returned_term = {
            "term": "  nytt begrep",
            "english": "new term",
            "level": 2,
            "subjects": ["genai"],
            "tools": ["generelt"],
            "sources": ["teknologiradet"],
            "definition": "En kort forklaring.",
        }
        duplicate_term = {
            **returned_term,
            "term": "Vibbekoding",
            "english": "VIBE-CODING",
        }
        api_response = {
            "output": [
                {
                    "type": "text",
                    "text": f"```json\n{json.dumps({'terms': [returned_term, duplicate_term]})}\n```",
                }
            ]
        }
        response = MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = json.dumps(api_response).encode("utf-8")
        changed_sources = [
            {
                "id": "teknologiradet",
                "name": "Teknologirådet",
                "url": "https://teknologiradet.no/ordliste-for-kunstig-intelligens/",
                "text": "Public source text.",
            }
        ]
        with (
            patch.dict(os.environ, {"GEMINI_API_KEY": "test-secret"}),
            patch.object(update_terms, "urlopen", return_value=response) as gemini_request,
        ):
            terms = update_terms.generate_terms(changed_sources)
        request = gemini_request.call_args.args[0]
        self.assertEqual(request.full_url, "https://generativelanguage.googleapis.com/v1beta/interactions")
        self.assertEqual(request.get_header("X-goog-api-key"), "test-secret")
        body = json.loads(request.data)
        self.assertEqual(body["model"], "gemini-2.5-flash")
        self.assertFalse(body["store"])
        self.assertEqual(body["response_format"]["mime_type"], "application/json")
        self.assertIn("Nivå 1: du er ny med KI", body["input"])
        self.assertEqual(body["generation_config"]["thinking_level"], "low")
        self.assertEqual(body["generation_config"]["max_output_tokens"], 8192)
        self.assertIn("english", body["response_format"]["schema"]["properties"]["terms"]["items"]["properties"])
        self.assertEqual(len(terms), 1)
        self.assertEqual(terms[0]["id"], "nytt-begrep")
        self.assertEqual(terms[0]["t"], "Nytt begrep")

    def test_gemini_retries_transient_server_errors(self):
        returned_term = {
            "term": "Nytt begrep",
            "english": "new term",
            "level": 2,
            "subjects": ["genai"],
            "tools": ["generelt"],
            "sources": ["teknologiradet"],
            "definition": "En kort forklaring.",
        }
        response = MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = json.dumps(
            {"output": [{"type": "text", "text": json.dumps({"terms": [returned_term]})}]}
        ).encode("utf-8")
        unavailable = HTTPError(
            "https://generativelanguage.googleapis.com/v1beta/interactions",
            503,
            "Service Unavailable",
            {},
            io.BytesIO(b'{"error":{"code":"service_unavailable"}}'),
        )
        changed_sources = [
            {
                "id": "teknologiradet",
                "name": "Teknologirådet",
                "url": "https://teknologiradet.no/ordliste-for-kunstig-intelligens/",
                "text": "Public source text.",
            }
        ]
        with (
            patch.dict(os.environ, {"GEMINI_API_KEY": "test-secret"}),
            patch.object(update_terms, "urlopen", side_effect=[unavailable, response]) as call,
            patch.object(update_terms.time, "sleep") as sleep,
        ):
            terms = update_terms.generate_terms(changed_sources)
        self.assertEqual(len(terms), 1)
        self.assertEqual(call.call_count, 2)
        sleep.assert_called_once_with(1)

    def test_reads_text_from_interaction_model_output_steps(self):
        result = {
            "output_text": "",
            "steps": [
                {"type": "user_input", "content": []},
                {
                    "type": "model_output",
                    "content": [
                        {"type": "text", "text": '{"terms":'},
                        {"type": "text", "text": ' []}'},
                    ],
                },
            ]
        }
        self.assertEqual(update_terms._response_text(result), '{"terms": []}')


if __name__ == "__main__":
    unittest.main()
