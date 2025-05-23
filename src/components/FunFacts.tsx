import React from 'react';
import { useNavigate } from 'react-router-dom';
import './FunFacts.css';

interface FunFact {
  text: string;
  relatedArticles: {
    title: string;
    description: string;
    link: string;
  }[];
}

const FunFacts: React.FC = () => {
  const navigate = useNavigate();

  const funFacts: FunFact[] = [
    {
      text: "Did you know... that a stray dog named Argo visited the ruins of Pompeii daily for 15 years and was considered its 'guardian'?",
      relatedArticles: [
        {
          title: "Argo - Pompeii's Guardian Dog",
          description: "The heartwarming story of a stray dog who became the unofficial guardian of the ancient ruins of Pompeii",
          link: "Argo_(Pompeii_dog)"
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
  ];

  const handleArticleClick = (link: string) => {
    navigate(`/article/${encodeURIComponent(link)}`);
  };

  return (
    <div className="fun-facts-container">
      {funFacts.map((fact, index) => (
        <div key={index} className="fun-fact">
          <p className="fact-text">{fact.text}</p>
          <div className="related-articles">
            {fact.relatedArticles.map((article, articleIndex) => (
              <div
                key={articleIndex}
                className="article-card"
                onClick={() => handleArticleClick(article.link)}
              >
                <h3>{decodeURIComponent(article.link.replace(/_/g, ' '))}</h3>
                <p>{article.description}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default FunFacts; 