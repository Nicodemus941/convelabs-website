
import React from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { blogPosts } from "@/data/blogPosts";
import DashboardWrapper from "@/components/dashboards/DashboardWrapper";
import { PageTransition } from "@/components/ui/page-transition";
import { motion } from "framer-motion";

const Blog = () => {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };
  
  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <DashboardWrapper>
      <div className="container mx-auto px-4 py-12">
        <PageTransition>
          <h1 className="text-4xl font-bold text-center mb-6">ConveLabs Blog</h1>
          <p className="text-lg text-center text-gray-600 max-w-3xl mx-auto mb-12">
            Expert insights, healthcare tips, and the latest news from Central Florida's premier mobile phlebotomy service.
          </p>
          
          <motion.div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
            variants={container}
            initial="hidden"
            animate="show"
          >
            {blogPosts.map((post) => (
              <motion.div 
                key={post.id} 
                className="bg-white rounded-lg shadow-md overflow-hidden transition-transform hover:translate-y-[-4px]"
                variants={item}
              >
                <Link to={`/blog/${post.slug}`}>
                  <img 
                    src={post.image} 
                    alt={post.title}
                    className="w-full h-48 object-cover"
                  />
                </Link>
                <div className="p-6">
                  <div className="flex items-center text-sm text-gray-500 mb-2">
                    <span>{format(post.date, "MMMM d, yyyy")}</span>
                    <span className="mx-2">•</span>
                    <span className="capitalize">{post.category}</span>
                  </div>
                  <Link to={`/blog/${post.slug}`}>
                    <h2 className="text-xl font-bold text-gray-900 mb-2 hover:text-conve-red transition-colors">
                      {post.title}
                    </h2>
                  </Link>
                  <p className="text-gray-600 mb-4">{post.excerpt}</p>
                  <Link 
                    to={`/blog/${post.slug}`}
                    className="text-conve-red font-medium hover:underline"
                  >
                    Read More →
                  </Link>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </PageTransition>
      </div>
    </DashboardWrapper>
  );
};

export default Blog;
