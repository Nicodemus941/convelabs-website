
import React from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { format } from "date-fns";
import { blogPosts } from "@/data/blogPosts";
import DashboardWrapper from "@/components/dashboards/DashboardWrapper";
import { PageTransition } from "@/components/ui/page-transition";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";

const BlogPost = () => {
  const { postId } = useParams();
  const post = blogPosts.find(post => post.slug === postId);
  
  if (!post) {
    return <Navigate to="/blog" replace />;
  }

  // Find related posts based on category and tags (up to 3)
  const relatedPosts = blogPosts
    .filter(p => p.id !== post.id && (
      p.category === post.category || 
      p.tags.some(tag => post.tags.includes(tag))
    ))
    .slice(0, 3);

  // Use the custom image for the specific post about athletes
  const displayImage = post.slug === "lab-results-fitness-performance-orlando-athletes" 
    ? "/lovable-uploads/d13be6f2-91f9-45fb-a673-28ad589efbb5.png"
    : post.image;

  return (
    <DashboardWrapper>
      <div className="container mx-auto px-4 py-12">
        <PageTransition>
          <div className="max-w-3xl mx-auto">
            <Link to="/blog" className="text-conve-red hover:underline inline-flex items-center mb-6">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Blog
            </Link>
            
            <motion.h1 
              className="text-4xl font-bold mb-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              {post.title}
            </motion.h1>
            
            <div className="flex items-center text-sm text-gray-500 mb-8">
              <span>{format(post.date, "MMMM d, yyyy")}</span>
              <span className="mx-2">•</span>
              <span>By {post.author}</span>
              <span className="mx-2">•</span>
              <span className="capitalize">{post.category}</span>
            </div>
            
            <motion.img 
              src={displayImage}
              alt={post.title}
              className="w-full h-80 object-cover rounded-lg mb-8"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            />
            
            <motion.div 
              className="prose prose-lg max-w-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              {post.content.startsWith('#') ? (
                <ReactMarkdown>{post.content}</ReactMarkdown>
              ) : (
                <>
                  <p>{post.content}</p>
                  
                  {/* Sample content since our actual content is short */}
                  <p>
                    Healthcare delivery is changing rapidly across Central Florida, and mobile services are at the forefront of this transformation. 
                    Patients in Orlando, Tampa, and surrounding areas are increasingly seeking alternatives to traditional healthcare settings.
                  </p>
                  
                  <h2>Why Mobile Health Services Matter</h2>
                  
                  <p>
                    The convenience of at-home services is changing patient expectations. Rather than scheduling appointments weeks in advance and 
                    traveling to crowded facilities, healthcare can now come directly to you, on your schedule.
                  </p>
                  
                  <p>
                    This shift has been particularly beneficial for:
                  </p>
                  
                  <ul>
                    <li>Elderly patients with mobility challenges</li>
                    <li>Busy professionals with limited time</li>
                    <li>Parents with young children</li>
                    <li>Patients with compromised immune systems</li>
                    <li>Those with chronic conditions requiring frequent monitoring</li>
                  </ul>
                  
                  <h2>The Future of Healthcare in Central Florida</h2>
                  
                  <p>
                    As the population in Central Florida continues to grow, particularly in the Orlando and Tampa metropolitan areas, 
                    the demand for flexible healthcare options will only increase. Mobile phlebotomy and telemedicine services are 
                    positioned to meet this demand while improving patient outcomes and satisfaction.
                  </p>
                  
                  <div className="bg-gray-50 p-6 rounded-lg my-8 border-l-4 border-conve-red">
                    <p className="text-lg font-medium">
                      "The convenience factor cannot be overstated. Having lab work done in the comfort of my own home has completely 
                      changed how I manage my healthcare."
                    </p>
                    <p className="text-gray-500 mt-2">— Orlando resident and ConveLabs member</p>
                  </div>
                </>
              )}
            </motion.div>
            
            <div className="mt-12 pt-8 border-t border-gray-200">
              <h3 className="font-bold text-xl mb-4">Related Topics</h3>
              <div className="flex flex-wrap gap-2">
                {post.tags.map(tag => (
                  <span 
                    key={tag}
                    className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {relatedPosts.length > 0 && (
              <div className="mt-12">
                <h3 className="font-bold text-2xl mb-6">Related Articles</h3>
                <div className="grid gap-6 md:grid-cols-3">
                  {relatedPosts.map(related => (
                    <Link 
                      key={related.id} 
                      to={`/blog/${related.slug}`}
                      className="block group"
                    >
                      <div className="bg-white rounded-lg shadow-md overflow-hidden h-full">
                        <img 
                          src={related.image} 
                          alt={related.title}
                          className="w-full h-40 object-cover"
                        />
                        <div className="p-4">
                          <h4 className="font-medium group-hover:text-conve-red transition-colors">
                            {related.title}
                          </h4>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </PageTransition>
      </div>
    </DashboardWrapper>
  );
};

export default BlogPost;

