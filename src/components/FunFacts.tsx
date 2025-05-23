import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getArticleImages, ArticleImage } from '../api/wikipedia';
import './FunFacts.css';

interface FunFact {
  text: string;
  relatedArticles: {
    title: string;
    description: string;
    link: string;
    thumbnail?: ArticleImage;
  }[];
}

const FunFacts: React.FC = () => {
  const navigate = useNavigate();
  const [facts, setFacts] = useState<FunFact[]>([]);

  const initialFunFacts = useMemo(() => [
    {
      text: "Did you know... that a stray dog named Argo visited the ruins of Pompeii daily for 15 years and was considered its 'guardian'?",
      relatedArticles: [
        {
          title: "Argo - Pompeii's Guardian Dog",
          description: "The heartwarming story of a stray dog who became the unofficial guardian of the ancient ruins of Pompeii",
          link: "Argo_(dog)"
        },
        {
          title: "Pompeii",
          description: "The ancient Roman city preserved by the eruption of Mount Vesuvius in 79 AD",
          link: "Pompeii"
        }
      ]
    },
    {
      text: "Did you know... that Lord Peter Palumbo bought Kentuck Knob, a Frank Lloyd Wright house, sight unseen after a single phone call?",
      relatedArticles: [
        {
          title: "Kentuck Knob",
          description: "A house designed by Frank Lloyd Wright in rural Pennsylvania",
          link: "Kentuck_Knob"
        },
        {
          title: "Frank Lloyd Wright",
          description: "The renowned American architect and designer",
          link: "Frank_Lloyd_Wright"
        }
      ]
    }
  ], []);

  useEffect(() => {
    const fetchImages = async () => {
      const factsWithImages = await Promise.all(
        initialFunFacts.map(async (fact) => {
          const articlesWithImages = await Promise.all(
            fact.relatedArticles.map(async (article) => {
              const images = await getArticleImages(article.link);
              return {
                ...article,
                thumbnail: images.length > 0 ? images[0] : undefined
              };
            })
          );
          return {
            ...fact,
            relatedArticles: articlesWithImages
          };
        })
      );
      setFacts(factsWithImages);
    };

    fetchImages();
  }, [initialFunFacts]);

  const handleArticleClick = (link: string) => {
    navigate(`/article/${encodeURIComponent(link)}`);
  };

  return (
    <div className="fun-facts-container">
      {facts.map((fact, index) => (
        <div key={index} className="fun-fact">
          <p className="fact-text">{fact.text}</p>
          <div className="related-articles">
            {fact.relatedArticles.map((article, articleIndex) => (
              <div
                key={articleIndex}
                className={`article-card ${!article.thumbnail ? 'no-image' : ''}`}
                onClick={() => handleArticleClick(article.link)}
              >
                {article.thumbnail && article.thumbnail.url && (
                  <div className="article-thumbnail">
                    <img
                      src={article.thumbnail.url}
                      alt={article.thumbnail.description || article.title}
                      loading="lazy"
                    />
                  </div>
                )}
                <div className="article-content">
                <h3>{decodeURIComponent(article.link.replace(/_/g, ' '))}</h3>
                <p>{article.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default FunFacts; 