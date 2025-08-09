import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.REACT_APP_GEMINI_API_KEY);

export async function summarizeText(text) {
    try {
        // ✅ 올바른 모델명과 최신 API 버전 사용
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `불필요한 서론 없이 해당 지역의 핵심 여행 매력을 2문장으로 간단히 알려줘:\n\n${text}`;
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (error) {
        console.error("Gemini 요약 오류:", error);
        return "요약을 불러올 수 없습니다.";
    }
}
