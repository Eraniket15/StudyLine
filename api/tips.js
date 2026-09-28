// api/tips.js
// Vercel serverless function for Studyline AI study tips
// Uses Google Gemini API (not Claude)

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
      error: "GEMINI_API_KEY is missing from Vercel environment variables.",
    });
  }

  try {
    const { subjects = [], hours = 4 } = req.body || {};

    if (!Array.isArray(subjects)) {
      return res.status(400).json({
        error: "Subjects must be an array.",
      });
    }

    if (subjects.length > 100) {
      return res.status(400).json({
        error: "Too many subjects.",
      });
    }

    const studyHours = Number(hours);

    if (
      !Number.isFinite(studyHours) ||
      studyHours < 1 ||
      studyHours > 24
    ) {
      return res.status(400).json({
        error: "Study hours must be between 1 and 24.",
      });
    }

    const subjectList = subjects
      .map((subject) => {
        const name = String(subject.name || "Unnamed subject");
        const date = String(subject.date || "Not specified");
        const difficulty = String(subject.difficulty || "Medium");

        return `- ${name} | Exam: ${date} | Difficulty: ${difficulty}`;
      })
      .join("\n");

    const prompt = `
You are the AI study assistant for Studyline.

The student can study ${studyHours} hours per day.

Their upcoming exams:
${subjectList || "No subjects have been added yet."}

Generate 5 practical, personalized study tips.

Requirements:
1. Prioritize exams with the closest deadlines.
2. Give extra attention to difficult subjects.
3. Respect the student's daily study time.
4. Suggest practical revision and practice techniques.
5. Keep the advice encouraging and concise.

Return exactly 5 numbered tips in plain text.
Do not use Markdown headings.
`;

    // Try the primary model and then a fallback if the model is unavailable.
    const models = [
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
    ];

    let tips = "";
    let lastError = null;

    for (const model of models) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
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

      if (response.ok) {
        tips =
          data.candidates?.[0]?.content?.parts
            ?.map((part) => part.text || "")
            .join("\n")
            .trim() || "";

        if (tips) {
          break;
        }

        lastError = "Gemini returned an empty response.";
        continue;
      }

      lastError =
        data.error?.message || `Gemini API returned ${response.status}.`;

      console.error(`Gemini API error (${model}):`, {
        status: response.status,
        message: lastError,
      });

      // Try the next model if this model is unavailable.
      if (response.status === 404) {
        continue;
      }

      // Do not retry authentication, quota, or other API errors.
      if (response.status === 400) {
        return res.status(502).json({
          error: "Gemini rejected the request. Check the API request.",
        });
      }

      if (response.status === 401 || response.status === 403) {
        return res.status(502).json({
          error: "Gemini API authentication failed. Check your API key.",
        });
      }

      if (response.status === 429) {
        return res.status(503).json({
          error: "Gemini rate limit or quota exceeded. Try again later.",
        });
      }

      return res.status(502).json({
        error: "Gemini API request failed.",
      });
    }

    if (!tips) {
      console.error("All Gemini models failed:", lastError);

      return res.status(502).json({
        error:
          "No available Gemini model could generate study tips. Check your API key and enabled models.",
      });
    }

    return res.status(200).json({ tips });
  } catch (error) {
    console.error("Studyline tips error:", error.message);

    return res.status(500).json({
      error: "Unable to generate study tips. Please try again.",
    });
  }
};
