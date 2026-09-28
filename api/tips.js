// Vercel serverless function: /api/tips

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "Missing GEMINI_API_KEY environment variable",
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
      .map((s) => {
        return `${s.name} (Exam: ${s.date}, Difficulty: ${s.difficulty})`;
      })
      .join("\n");

    const prompt = `
You are a helpful study planning assistant.

The student can study ${hours} hours per day.

Their subjects and exam dates:
${subjectList || "No subjects added yet."}

Give 5 short, practical study tips tailored to these subjects,
exam dates, difficulty levels, and available study hours.

Use plain text with numbered tips.
Keep the advice encouraging and specific.
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
            maxOutputTokens: 500,
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);

      return res.status(502).json({
        error: "Gemini API request failed",
      });
    }

    const tips =
      data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("\n")
        .trim() || "No tips available.";

    return res.status(200).json({ tips });
  } catch (error) {
    console.error("Study tips error:", error);

    return res.status(500).json({
      error: "Unable to generate study tips",
    });
  }
};
