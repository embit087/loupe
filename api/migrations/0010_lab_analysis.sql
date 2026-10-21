-- Reviewed study evidence is shared across clients and survives app rebuilds.
CREATE TABLE lab_analysis_sources (
  author TEXT NOT NULL,
  asset TEXT NOT NULL,
  audio_method TEXT NOT NULL,
  ocr_method TEXT NOT NULL,
  ocr_interval_seconds REAL NOT NULL,
  PRIMARY KEY (author, asset)
);

CREATE TABLE lab_transcript_passages (
  author TEXT NOT NULL,
  asset TEXT NOT NULL,
  passage_index INTEGER NOT NULL,
  start_seconds REAL NOT NULL,
  end_seconds REAL NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (author, asset, passage_index),
  FOREIGN KEY (author, asset) REFERENCES lab_analysis_sources (author, asset) ON DELETE CASCADE
);

CREATE TABLE lab_ocr_samples (
  author TEXT NOT NULL,
  asset TEXT NOT NULL,
  time_seconds REAL NOT NULL,
  strings_json TEXT NOT NULL,
  PRIMARY KEY (author, asset, time_seconds),
  FOREIGN KEY (author, asset) REFERENCES lab_analysis_sources (author, asset) ON DELETE CASCADE
);

-- Seeded from web/content/lab-studies/demo.trail__DEMO00101.json (sample data).
INSERT INTO lab_analysis_sources (author, asset, audio_method, ocr_method, ocr_interval_seconds)
VALUES ('demo.trail', 'DEMO00101.mp4', 'Sample transcript written for the demo; no audio was analysed.', 'Sample on-screen text written for the demo.', 1.0);

INSERT INTO lab_transcript_passages (author, asset, passage_index, start_seconds, end_seconds, text)
VALUES ('demo.trail', 'DEMO00101.mp4', 0, 0.0, 3.0, 'Three layers, one simple rule: you should be a little cold when you start walking.');

INSERT INTO lab_transcript_passages (author, asset, passage_index, start_seconds, end_seconds, text)
VALUES ('demo.trail', 'DEMO00101.mp4', 1, 3.0, 6.0, 'The base layer moves sweat. Wool or synthetic, never cotton.');

INSERT INTO lab_transcript_passages (author, asset, passage_index, start_seconds, end_seconds, text)
VALUES ('demo.trail', 'DEMO00101.mp4', 2, 6.0, 9.0, 'The mid layer traps warmth. A grid fleece breathes on the climb.');

INSERT INTO lab_transcript_passages (author, asset, passage_index, start_seconds, end_seconds, text)
VALUES ('demo.trail', 'DEMO00101.mp4', 3, 9.0, 12.0, 'The shell blocks wind and rain. Keep it in the top of your pack.');

INSERT INTO lab_transcript_passages (author, asset, passage_index, start_seconds, end_seconds, text)
VALUES ('demo.trail', 'DEMO00101.mp4', 4, 12.0, 15.0, 'Add and remove layers before you overheat, not after.');

INSERT INTO lab_ocr_samples (author, asset, time_seconds, strings_json)
VALUES ('demo.trail', 'DEMO00101.mp4', 0.0, '["LAYERING 101"]');

INSERT INTO lab_ocr_samples (author, asset, time_seconds, strings_json)
VALUES ('demo.trail', 'DEMO00101.mp4', 1.0, '["LAYERING 101"]');

INSERT INTO lab_ocr_samples (author, asset, time_seconds, strings_json)
VALUES ('demo.trail', 'DEMO00101.mp4', 2.0, '["LAYERING 101"]');

INSERT INTO lab_ocr_samples (author, asset, time_seconds, strings_json)
VALUES ('demo.trail', 'DEMO00101.mp4', 3.0, '["BASE", "merino 150"]');

INSERT INTO lab_ocr_samples (author, asset, time_seconds, strings_json)
VALUES ('demo.trail', 'DEMO00101.mp4', 4.0, '["BASE", "merino 150"]');

INSERT INTO lab_ocr_samples (author, asset, time_seconds, strings_json)
VALUES ('demo.trail', 'DEMO00101.mp4', 5.0, '["BASE", "merino 150"]');

INSERT INTO lab_ocr_samples (author, asset, time_seconds, strings_json)
VALUES ('demo.trail', 'DEMO00101.mp4', 6.0, '["MID", "grid fleece"]');

INSERT INTO lab_ocr_samples (author, asset, time_seconds, strings_json)
VALUES ('demo.trail', 'DEMO00101.mp4', 7.0, '["MID", "grid fleece"]');

INSERT INTO lab_ocr_samples (author, asset, time_seconds, strings_json)
VALUES ('demo.trail', 'DEMO00101.mp4', 8.0, '["MID", "grid fleece"]');

INSERT INTO lab_ocr_samples (author, asset, time_seconds, strings_json)
VALUES ('demo.trail', 'DEMO00101.mp4', 9.0, '["SHELL", "2.5 layer"]');

INSERT INTO lab_ocr_samples (author, asset, time_seconds, strings_json)
VALUES ('demo.trail', 'DEMO00101.mp4', 10.0, '["SHELL", "2.5 layer"]');

INSERT INTO lab_ocr_samples (author, asset, time_seconds, strings_json)
VALUES ('demo.trail', 'DEMO00101.mp4', 11.0, '["SHELL", "2.5 layer"]');

INSERT INTO lab_ocr_samples (author, asset, time_seconds, strings_json)
VALUES ('demo.trail', 'DEMO00101.mp4', 12.0, '["BASE + MID + SHELL"]');

INSERT INTO lab_ocr_samples (author, asset, time_seconds, strings_json)
VALUES ('demo.trail', 'DEMO00101.mp4', 13.0, '["BASE + MID + SHELL"]');

INSERT INTO lab_ocr_samples (author, asset, time_seconds, strings_json)
VALUES ('demo.trail', 'DEMO00101.mp4', 14.0, '["BASE + MID + SHELL"]');
