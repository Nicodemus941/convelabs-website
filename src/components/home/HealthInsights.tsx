import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { blogPosts } from '@/data/blogPosts';

const HealthInsights: React.FC = () => {
  // Take 3 most recent posts
  const featured = blogPosts.slice(0, 3);

  return (
    <section className="py-12 md:py-16 bg-gray-50">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-white border rounded-full px-4 py-1.5 text-sm mb-4">
            <BookOpen className="h-4 w-4 text-[#B91C1C]" />
            <span className="font-medium">Health Insights</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-bold">
            Stay Informed About Your Health
          </h2>
          <p className="text-muted-foreground mt-2 max-w-xl mx-auto">
            Expert insights from our clinical team to help you make smarter health decisions.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {featured.map(post => (
            <Link key={post.id} to={`/blog/${post.slug}`}>
              <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer group overflow-hidden">
                {post.image && (
                  <div className="h-40 overflow-hidden">
                    <img src={post.image} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  </div>
                )}
                <CardContent className="p-4">
                  <p className="text-xs text-[#B91C1C] font-semibold uppercase tracking-wide mb-1">
                    {post.category}
                  </p>
                  <h3 className="font-bold text-sm leading-snug mb-2 group-hover:text-[#B91C1C] transition-colors">
                    {post.title}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {post.excerpt}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <div className="text-center mt-8">
          <Button variant="outline" className="rounded-xl" asChild>
            <Link to="/blog">
              View All Articles <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default HealthInsights;
