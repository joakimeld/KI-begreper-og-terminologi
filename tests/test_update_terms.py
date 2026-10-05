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


class RepositoryIntegrationTests(unittest.TestCase):
    def test_discovers_documented_sources_and_taxonomies(self):
        index = update_terms.INDEX.read_text(encoding="utf-8")
        sources = update_terms.parse_sources(index)
        self.assertEqual(len(sources), 31)
        self.assertIn("teknologiradet", {source["id"] for source in sources})
        self.assertEqual(len(update_terms.parse_taxonomy(index, "FAGOMRADER")), 9)
        self.assertEqual(len(update_terms.parse_taxonomy(index, "VERKTOY")), 7)
        self.assertEqual(len(update_terms.parse_existing_term_ids(index)), 97)
        self.assertEqual(
            update_terms.parse_level_descriptions(index),
            {
                1: "Nivå 1: du er ny med KI og trenger vokabularet for å delta i samtalen.",
                2: "Nivå 2: du bruker KI jevnlig og vil forstå hvordan løsningene settes sammen.",
                3: "Nivå 3: du designer, bygger eller styrer KI-løsninger i leveranse.",
                4: "Nivå 4: du går inn i modellenes indre virkemåte og forskningsfronten.",
            },
        )

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
            "id": "nytt-begrep",
            "t": "Nytt begrep",
            "en": "new term",
            "l": 2,
            "f": ["genai"],
            "v": ["generelt"],
            "k": ["teknologiradet"],
            "d": "En kort forklaring.",
        }
        api_response = {"output": [{"type": "text", "text": json.dumps({"terms": [returned_term]})}]}
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
        self.assertEqual(terms[0]["id"], "nytt-begrep")

    def test_gemini_retries_transient_server_errors(self):
        returned_term = {
            "id": "nytt-begrep",
            "t": "Nytt begrep",
            "en": "new term",
            "l": 2,
            "f": ["genai"],
            "v": ["generelt"],
            "k": ["teknologiradet"],
            "d": "En kort forklaring.",
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
