import React from "react";
import { MapPin } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";

const cities = [
  { name: "Orlando", slug: "orlando" },
  { name: "Winter Park", slug: "winter-park" },
  { name: "Windermere", slug: "windermere" },
  { name: "Dr. Phillips", slug: "doctor-phillips" },
  { name: "Lake Nona", slug: "lake-nona" },
  { name: "Celebration", slug: "celebration" },
  { name: "Bay Hill", slug: "bay-hill" },
  { name: "Heathrow", slug: "heathrow-golf" },
  { name: "Isleworth", slug: "isleworth" },
  { name: "Golden Oak", slug: "golden-oak" },
  { name: "Lake Mary", slug: "lake-mary" },
  { name: "Kissimmee", slug: "kissimmee" },
  { name: "Altamonte Springs", slug: "altamonte-springs" },
  { name: "Sanford", slug: "sanford" },
  { name: "Oviedo", slug: "oviedo" },
  { name: "Maitland", slug: "maitland" },
  { name: "Clermont", slug: "clermont" },
  { name: "Reunion", slug: "reunion" },
];

const ServiceAreasMap = () => {
  return (
    <section id="service-areas" className="py-16 sm:py-20 bg-muted/30">
      <div className="container mx-auto px-4 max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Areas We Serve
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Mobile phlebotomy across Orlando and Central Florida. We come to your
            home, office, or hotel.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
        >
          {cities.map((city) => (
            <Link
              key={city.slug}
              to={`/locations/${city.slug}`}
              className="flex items-center gap-2 p-3 bg-white rounded-xl border border-border hover:border-conve-red/30 hover:shadow-sm transition-all group"
            >
              <MapPin className="h-4 w-4 text-conve-red flex-shrink-0 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium text-foreground group-hover:text-conve-red transition-colors">
                {city.name}
              </span>
            </Link>
          ))}
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-center text-sm text-muted-foreground mt-8"
        >
          Don't see your area?{" "}
          <a
            href="tel:+19415279169"
            className="text-conve-red font-semibold underline"
          >
            Call 941-527-9169
          </a>{" "}
          — we're expanding fast.
        </motion.p>
      </div>
    </section>
  );
};

export default ServiceAreasMap;
