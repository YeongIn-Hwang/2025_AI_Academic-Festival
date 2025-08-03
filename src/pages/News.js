import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { summarizeText } from "../utils/gemini";
import { fetchImageURL } from "../utils/storage";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { useInView } from "react-intersection-observer";
import travelArticles from "../data/travelArticles";
import "../styles/news.css";

const db = getFirestore();

export default function News() {
    const [articles, setArticles] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            const articlePromises = travelArticles.map(async (article) => {
                const { url, title, thumbnail, category, date, author } = article;

                // ✅ Firebase Storage URL 변환
                let imageURL;
                try {
                    imageURL = await fetchImageURL(thumbnail);
                } catch {
                    imageURL = "https://via.placeholder.com/600x400?text=No+Image";
                }

                // ✅ Firestore 캐싱
                const summaryRef = doc(db, "summaries", encodeURIComponent(title));
                const cachedDoc = await getDoc(summaryRef);
                let summary;

                if (cachedDoc.exists()) {
                    summary = cachedDoc.data().summary;
                } else {
                    try {
                        summary = await summarizeText(
                            `기사 제목: ${title}\n불필요한 서론 없이 해당 지역의 핵심 여행 매력을 2문장으로 간단히 알려줘.`
                        );
                        await setDoc(summaryRef, { summary });
                    } catch {
                        summary = "요약을 불러올 수 없습니다.";
                    }
                }

                return { url, title, image: imageURL, category, date, author, summary };
            });

            const results = await Promise.all(articlePromises);
            setArticles(results);
            setLoading(false);
        };

        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="news-wrapper">
                <div className="skeleton-hero"></div>
                <div className="skeleton-grid">
                    {[...Array(6)].map((_, i) => <div key={i} className="skeleton-card"></div>)}
                </div>
            </div>
        );
    }

    const [hero, ...others] = articles;

    return (
        <div className="news-wrapper">
            {/* ✅ Hero Section */}
            <motion.section
                className="hero-article"
                initial={{ opacity: 0, y: -50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
            >
                <a href={hero.url} target="_blank" rel="noopener noreferrer">
                    <img src={hero.image} alt={hero.title} loading="lazy" />
                </a>
                <div className="hero-overlay">
                    <p className="category">{hero.category} | {hero.date}</p>
                    <h1><a href={hero.url} target="_blank" rel="noopener noreferrer" className="title-link">{hero.title}</a></h1>
                    <p className="summary"><span className="ai-label">AI요약:</span> {hero.summary}</p>
                    <a href={hero.url} className="read-more" target="_blank" rel="noopener noreferrer">기사 보기 →</a>
                </div>
            </motion.section>

            {/* ✅ TODAY’S STORIES */}
            <h2 className="section-title">TODAY’S STORIES</h2>
            <div className="stories-grid">
                {others.slice(0, 3).map((a, idx) => (
                    <LazyCard key={idx} article={a} delay={idx * 0.2} />
                ))}
            </div>

            {/* ✅ BEST STORIES */}
            <h2 className="section-title">BEST STORIES</h2>
            <div className="best-stories">
                {others.slice(3).map((a, idx) => (
                    <LazyCard key={idx} article={a} delay={idx * 0.1} compact />
                ))}
            </div>
        </div>
    );
}

/* ✅ LazyCard Component */
function LazyCard({ article, delay, compact }) {
    const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.2 });

    return (
        <motion.div
            ref={ref}
            className={compact ? "best-card" : "story-card"}
            initial={{ opacity: 0, y: 30 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay }}
        >
            <a href={article.url} target="_blank" rel="noopener noreferrer">
                <img src={article.image} alt={article.title} loading="lazy" />
            </a>
            <h4><a href={article.url} target="_blank" rel="noopener noreferrer" className="title-link">{article.title}</a></h4>
            <p className="summary"><span className="ai-label">AI요약:</span> {article.summary}</p>
            <p className="meta">{article.date}</p>
            <a href={article.url} target="_blank" rel="noopener noreferrer" className="read-more">기사 보기 →</a>
        </motion.div>
    );
}
