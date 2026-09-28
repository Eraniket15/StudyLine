module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "Missing GEMINI_API_KEY",
    });
  }

  try {
    const { subjects = [], hours = 4 } = req.body || {};

    if (!Array.isArray(subjects)) {
      return res.status(400).json({
        error: "Subjects must be an array",
      });
    }

    const subjectList = subjects
      .map((s) =>
        `${s.name} (Exam: ${s.date}, Difficulty: ${s.difficulty})`
      )
      .join("\n");

    const prompt = `
You are Studyline, a helpful study planning assistant.

The student can study ${hours} hours per day.

Subjects and exam dates:
${subjectList || "No subjects added yet."}

Generate 5 short, practical study tips.
Prioritize difficult subjects and approaching exams.
Include revision, practice questions, and breaks.
Use numbered plain-text tips.
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 600,
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", response.status, data);

      return res.status(502).json({
        error: "Gemini API request failed",
        details: data.error?.message || "Unknown API error",
      });
    }

    const tips =
      data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("\n")
        .trim();

    if (!tips) {
      return res.status(502).json({
        error: "Gemini returned no study tips",
      });
    }

    return res.status(200).json({ tips });
  } catch (error) {
    console.error("Study tips error:", error);

    return res.status(500).json({
      error: "Unable to generate study tips",
    });
  }
};
